FROM python:3.11-slim

WORKDIR /app
COPY src ./src
COPY data ./data

ENV PORT=8765
EXPOSE 8765

CMD ["python3", "src/http_server.py"]
