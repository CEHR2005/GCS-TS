package main

import (
	"bufio"
	"fmt"
	"io"
	"os"

	"gcs-oracle/internal/oracle"
)

const maxRequestSize = 16 * 1024 * 1024

func main() {
	if err := run(os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(input io.Reader, output io.Writer) error {
	scanner := bufio.NewScanner(input)
	scanner.Buffer(make([]byte, 64*1024), maxRequestSize)
	writer := bufio.NewWriter(output)
	lineNumber := 0

	for scanner.Scan() {
		lineNumber++
		encoded, err := oracle.ProcessLine(scanner.Bytes())
		if err != nil {
			return fmt.Errorf("request line %d: %w", lineNumber, err)
		}
		if _, err = writer.Write(encoded); err != nil {
			return fmt.Errorf("write response line %d: %w", lineNumber, err)
		}
		if err = writer.WriteByte('\n'); err != nil {
			return fmt.Errorf("write response line %d: %w", lineNumber, err)
		}
		if err = writer.Flush(); err != nil {
			return fmt.Errorf("flush response line %d: %w", lineNumber, err)
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scan request line: %w", err)
	}
	return nil
}
