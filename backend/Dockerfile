
FROM golang:1.27-alpine AS dev
WORKDIR /app
RUN go install github.com/air-verse/air@latest
COPY go.mod go.sum ./
RUN go mod download
CMD [ "air" ]


FROM golang:1.27-alpine AS build
WORKDIR /app
RUN go install github.com/air-verse/air@latest
COPY . .
RUN CGO_ENABLED=0 go build -ldfalgs="-s w" -o ./server .

FROM alpine:3.23 AS prod
WORKDIR /app
COPY --from=build /server ./server
CMD [ "./server" ]
