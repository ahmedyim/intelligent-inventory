FROM python:3.11-slim

WORKDIR /code
# Install system dependencies (needed for certain Python packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies first (optimizes Docker caching)
COPY requirements.txt /code/
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code into the container
COPY ./app /code/app

EXPOSE 8000
# Command to run the application using Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]