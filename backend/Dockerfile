FROM golang:1.27-alpine AS dev
WORKDIR /app
RUN go install github.com/air-verse/air@latest
COPY go.mod go.sum ./
COPY libs/go.mod libs/go.sum ./libs/
RUN go mod download
CMD ["air"]

FROM golang:1.27-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
COPY libs/go.mod libs/go.sum ./libs/
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /server .

FROM golang:1.27-alpine AS wol-build
WORKDIR /app
COPY go.mod go.sum ./
COPY libs/go.mod libs/go.sum ./libs/
RUN go mod download
COPY cmd/wol ./cmd/wol
COPY libs ./libs
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /wol ./cmd/wol

FROM alpine:3.23 AS wol
COPY --from=wol-build /wol /wol
CMD ["/wol"]

FROM alpine:3.23 AS prod
WORKDIR /app
COPY --from=build /server ./server
CMD ["./server"]
