# Build stage
FROM rust:1-bookworm AS builder

WORKDIR /usr/src/app
# Install cmake for rdkafka and unzip/curl for duckdb
RUN apt-get update && apt-get install -y cmake build-essential libssl-dev pkg-config curl unzip

# Download DuckDB
RUN arch=$(uname -m) && \
    if [ "$arch" = "aarch64" ]; then \
        curl -L https://github.com/duckdb/duckdb/releases/download/v1.0.0/libduckdb-linux-aarch64.zip -o duckdb.zip; \
    else \
        curl -L https://github.com/duckdb/duckdb/releases/download/v1.0.0/libduckdb-linux-amd64.zip -o duckdb.zip; \
    fi && \
    unzip duckdb.zip -d /usr/local/lib/ && \
    rm duckdb.zip

ENV DUCKDB_LIB_DIR=/usr/local/lib
ENV LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH

# Copy project files
COPY Cargo.toml ./
COPY src ./src

# Build for release
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates libssl3 curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /usr/local/lib/libduckdb.so /usr/local/lib/
ENV LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH
COPY --from=builder /usr/src/app/target/release/osrs-rust-processor /app/osrs-rust-processor

EXPOSE 8001

CMD ["/app/osrs-rust-processor"]
