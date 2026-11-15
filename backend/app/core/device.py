from fastapi import Depends, Request
from user_agents import parse


def get_client_ip(request: Request) -> str | None:
    # Behind a proxy/load balancer, use the forwarded header (only if you trust your proxy)
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def get_device_info(request: Request, client_device_name: str | None = None) -> dict:
    user_agent = request.headers.get("user-agent")

    if client_device_name:                       # your own mobile app sent a name
        name = client_device_name[:100]
    elif not user_agent:
        name = "Unknown device"
    else:
        ua = parse(user_agent)
        name = f"{ua.browser.family} on {ua.os.family}"   # "Safari on iOS"

    return {
        "device_name": name,
        "user_agent": user_agent[:500] if user_agent else None,
        "ip_address": get_client_ip(request),
    }


def device_dep(request: Request) -> dict:
    """FastAPI dependency for routes that have no device_name in the body.
    Mobile apps can send the name in an X-Device-Name header."""
    return get_device_info(request, request.headers.get("x-device-name"))