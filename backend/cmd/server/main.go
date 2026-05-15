package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/gitnav/backend/internal/api"
	"github.com/gitnav/backend/internal/db"
)

func main() {
	ctx := context.Background()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://gitnav:gitnav@localhost:5432/gitnavdb?sslmode=disable"
	}

	database, err := db.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("database connect: %v", err)
	}
	defer database.Close()
	log.Println("✅ Database connected")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := api.NewServer(database)
	addr := fmt.Sprintf(":%s", port)
	log.Printf("🚀 Git Time Navigator backend listening on %s", addr)
	if err := http.ListenAndServe(addr, srv.Router()); err != nil {
		log.Fatalf("server: %v", err)
	}
}
