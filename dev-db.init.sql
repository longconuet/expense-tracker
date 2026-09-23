-- Tạo sẵn 2 database cho test + e2e (chạy tự động 1 lần khi volume PG khởi tạo).
-- DB chính `expense_tracker` (dev) được tạo bởi env POSTGRES_DB trong docker-compose.dev.yml.
CREATE DATABASE expense_tracker_test;
CREATE DATABASE expense_tracker_e2e;
