FROM python:3.9-slim

WORKDIR /app

# System dependencies for image processing and standard utils
RUN apt-get update && apt-get install -y ffmpeg libsm6 libxext6 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create cache dir with permissions for Hugging Face
RUN mkdir -p /.cache/huggingface && chmod 777 /.cache/huggingface

COPY . .

# Expose port 7860 as expected by HF Spaces
EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
