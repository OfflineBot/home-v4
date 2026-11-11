package main

import (
	"encoding/json"
	"errors"
	"log"
	"log/slog"
	"net"
	"net/http"
	"os"
	"time"

	"home-v4/libs/wol"
)

const (
	defaultSocket = "/run/wol/wol.sock"
	socketMode    = 0o600
	maxBodyBytes  = 1 << 10
)

type wakeRequest struct {
	MAC       string `json:"mac"`
	Broadcast string `json:"broadcast"`
	Port      int    `json:"port"`
}

func main() {
	path := os.Getenv("WOL_SOCKET")
	if path == "" {
		path = defaultSocket
	}

	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Fatal(err)
	}

	listener, err := net.Listen("unix", path)
	if err != nil {
		log.Fatal(err)
	}
	if err := os.Chmod(path, socketMode); err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /wake", wake)

	server := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       5 * time.Second,
		WriteTimeout:      5 * time.Second,
	}

	slog.Info("wol: listening", "socket", path)
	log.Fatal(server.Serve(listener))
}

func wake(w http.ResponseWriter, r *http.Request) {
	var req wakeRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes)).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	err := wol.Send(req.MAC, req.Broadcast, req.Port)
	switch {
	case err == nil:
		slog.Info("wol: packet sent", "mac", req.MAC, "broadcast", req.Broadcast, "port", req.Port)
		w.WriteHeader(http.StatusNoContent)
	case errors.Is(err, wol.ErrInvalidMAC), errors.Is(err, wol.ErrInvalidAddress), errors.Is(err, wol.ErrInvalidPort):
		http.Error(w, err.Error(), http.StatusBadRequest)
	default:
		slog.Warn("wol: send failed", "err", err)
		http.Error(w, "send failed", http.StatusBadGateway)
	}
}
