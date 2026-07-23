FROM golang:1.26.5-bookworm@sha256:1ecb7edf62a0408027bd5729dfd6b1b8766e578e8df93995b225dfd0944eb651 AS go-toolchain

ENV GOEXPERIMENT=jsonv2

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        pkg-config \
        libx11-dev \
        libgl1-mesa-dev \
        libfontconfig1-dev \
        libfreetype-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /source

COPY tools/gcs-oracle/go.mod tools/gcs-oracle/go.sum ./tools/gcs-oracle/
COPY tools/gcs-primitives-oracle/go.mod tools/gcs-primitives-oracle/go.sum ./tools/gcs-primitives-oracle/
COPY tools/gcs-traits-oracle/go.mod tools/gcs-traits-oracle/go.sum ./tools/gcs-traits-oracle/
RUN go -C tools/gcs-oracle mod download
RUN go -C tools/gcs-primitives-oracle mod download
RUN go -C tools/gcs-traits-oracle mod download

COPY tools/gcs-oracle ./tools/gcs-oracle
COPY tools/gcs-primitives-oracle ./tools/gcs-primitives-oracle
COPY tools/gcs-traits-oracle ./tools/gcs-traits-oracle
RUN go -C tools/gcs-oracle build -o /usr/local/bin/gcs-oracle ./cmd/gcs-oracle
RUN go -C tools/gcs-primitives-oracle build -o /usr/local/bin/gcs-primitives-oracle ./cmd/gcs-primitives-oracle
RUN go -C tools/gcs-traits-oracle build -o /usr/local/bin/gcs-traits-oracle ./cmd/gcs-traits-oracle

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

COPY --from=go-toolchain /usr/local/go /usr/local/go
COPY --from=go-toolchain /go/pkg/mod /go/pkg/mod
COPY --from=go-toolchain /usr/local/bin/gcs-oracle /usr/local/bin/gcs-oracle
COPY --from=go-toolchain /usr/local/bin/gcs-primitives-oracle /usr/local/bin/gcs-primitives-oracle
COPY --from=go-toolchain /usr/local/bin/gcs-traits-oracle /usr/local/bin/gcs-traits-oracle

ENV PATH="/usr/local/go/bin:${PATH}" \
    GOCACHE=/tmp/go-build \
    GOMODCACHE=/go/pkg/mod \
    GOPROXY=off \
    GOEXPERIMENT=jsonv2 \
    CGO_ENABLED=1

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        ca-certificates \
        gcc \
        g++ \
        pkg-config \
        libx11-dev \
        libgl1-mesa-dev \
        libfontconfig1-dev \
        libfreetype-dev \
    && rm -rf /var/lib/apt/lists/*

RUN npm install --global pnpm@11.13.1

WORKDIR /workspace

CMD ["sh"]
