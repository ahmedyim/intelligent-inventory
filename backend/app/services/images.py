"""
Product images on Cloudinary.
Uploads go browser -> this API -> Cloudinary, so the API secret never leaves the server
and every file is checked here first.
"""
import io
import logging
import re
import uuid
from typing import Optional
from urllib.parse import urlparse

import cloudinary
import cloudinary.exceptions
import cloudinary.uploader
from fastapi import HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.exceptions import BadRequestError

logger = logging.getLogger(__name__)

MAX_BYTES = settings.MAX_IMAGE_MB * 1024 * 1024
FOLDER = settings.CLOUDINARY_FOLDER.strip("/")


def configured() -> bool:
    return bool(settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY and settings.CLOUDINARY_API_SECRET)


if configured():
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )


def _sniff(data: bytes) -> Optional[str]:
    """The real type, from the first bytes. The filename and Content-Type header are not trusted."""
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


async def _read_limited(file: UploadFile) -> bytes:
    chunks, size = [], 0
    while chunk := await file.read(64 * 1024):
        size += len(chunk)
        if size > MAX_BYTES:
            raise BadRequestError(f"The image is larger than {settings.MAX_IMAGE_MB} MB", code="image_too_large")
        chunks.append(chunk)
    return b"".join(chunks)


def _upload(data: bytes) -> dict:
    return cloudinary.uploader.upload(
        io.BytesIO(data),
        folder=FOLDER,
        public_id=uuid.uuid4().hex,          # random: nobody can guess or overwrite another file
        resource_type="image",
        allowed_formats=["jpg", "png", "webp"],
        overwrite=False,
        timeout=30,
    )


async def upload_product_image(file: UploadFile) -> dict:
    if not configured():
        raise HTTPException(status_code=503, detail="Image uploads are not set up on the server yet")

    data = await _read_limited(file)
    if not data:
        raise BadRequestError("The file is empty", code="empty_file")
    if _sniff(data) is None:
        raise BadRequestError("Only JPG, PNG or WebP images are allowed", code="unsupported_image")

    try:
        result = await run_in_threadpool(_upload, data)   # the SDK is blocking, so keep it off the event loop
    except cloudinary.exceptions.BadRequest:
        raise BadRequestError("This file is not a valid image", code="invalid_image")
    except Exception:
        logger.exception("Cloudinary upload failed")
        raise HTTPException(status_code=502, detail="The image could not be stored. Please try again.")

    return {
        "url": result["secure_url"],
        "width": result.get("width"),
        "height": result.get("height"),
        "bytes": result.get("bytes"),
    }


# ------------------------------------------------------------------ deleting
def owned_public_id(url: Optional[str]) -> Optional[str]:
    """The Cloudinary id of an image that lives in OUR cloud and OUR folder, else None.
    A pasted link to someone else's image, or to anything outside the folder, is never deleted."""
    if not url or not configured():
        return None
    p = urlparse(url)
    if p.scheme != "https" or p.hostname != "res.cloudinary.com":
        return None
    m = re.fullmatch(
        rf"/{re.escape(settings.CLOUDINARY_CLOUD_NAME)}/image/upload/(?:v\d+/)?({re.escape(FOLDER)}/[A-Za-z0-9_-]+)\.[A-Za-z0-9]+",
        p.path,
    )
    return m.group(1) if m else None


def _destroy(public_id: str) -> None:
    cloudinary.uploader.destroy(public_id, resource_type="image", invalidate=True)


async def delete_image(url: Optional[str]) -> None:
    """Best effort: a failure is logged but never breaks the request that triggered it."""
    public_id = owned_public_id(url)
    if not public_id:
        return
    try:
        await run_in_threadpool(_destroy, public_id)
    except Exception:
        logger.warning("Could not delete the image %s", public_id)