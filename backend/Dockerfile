# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git gcc musl-dev ca-certificates

WORKDIR /app

# These env vars let go fetch deps and build without a sum database:
#   GONOSUMDB  — skip sum DB lookup for all modules
#   GONOSUMCHECK — skip checksum verification entirely
#   GOFLAGS=-mod=mod — allow go.sum to be created/updated at build time
#   GOPROXY    — use the public proxy (no sum DB auth needed)
ENV GONOSUMDB="*" \
    GONOSUMCHECK="*" \
    GOFLAGS="-mod=mod" \
    GOPROXY="https://proxy.golang.org,direct" \
    CGO_ENABLED=0 \
    GOOS=linux

# Copy go.mod first — Docker layer cache: only re-download if go.mod changes
COPY go.mod ./

# Download all direct + indirect deps (generates go.sum inside the layer)
RUN go mod download all

# Copy full source
COPY . .

# Build binary
RUN go build -o /gitnav-server ./cmd/server

# ── Stage 2: minimal runtime image ───────────────────────────────────────────
FROM alpine:3.19
RUN apk add --no-cache ca-certificates git openssh-client
WORKDIR /app
COPY --from=builder /gitnav-server .
RUN mkdir -p /tmp/repos
EXPOSE 8080
CMD ["/app/gitnav-server"]
