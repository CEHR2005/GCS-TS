FROM golang:1.26.5-bookworm@sha256:1ecb7edf62a0408027bd5729dfd6b1b8766e578e8df93995b225dfd0944eb651 AS go-toolchain

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

COPY --from=go-toolchain /usr/local/go /usr/local/go

ENV PATH="/usr/local/go/bin:${PATH}" \
    GOCACHE=/tmp/go-build

RUN npm install --global pnpm@11.13.1

WORKDIR /workspace

CMD ["sh"]
