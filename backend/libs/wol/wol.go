package wol

import (
	"bytes"
	"errors"
	"net"
)

const (
	syncBytes = 6
	macRepeat = 16
	maxPort   = 65535
)

var (
	ErrInvalidMAC     = errors.New("invalid mac address")
	ErrInvalidAddress = errors.New("invalid broadcast address")
	ErrInvalidPort    = errors.New("invalid port")
)

func Packet(mac string) ([]byte, error) {
	hw, err := net.ParseMAC(mac)
	if err != nil || len(hw) != syncBytes {
		return nil, ErrInvalidMAC
	}

	packet := bytes.Repeat([]byte{0xFF}, syncBytes)
	for range macRepeat {
		packet = append(packet, hw...)
	}

	return packet, nil
}

func Send(mac, broadcast string, port int) error {
	packet, err := Packet(mac)
	if err != nil {
		return err
	}

	ip := net.ParseIP(broadcast).To4()
	if ip == nil {
		return ErrInvalidAddress
	}
	if port < 1 || port > maxPort {
		return ErrInvalidPort
	}

	conn, err := net.DialUDP("udp4", nil, &net.UDPAddr{IP: ip, Port: port})
	if err != nil {
		return err
	}
	defer conn.Close()

	_, err = conn.Write(packet)
	return err
}
