-- Create sale table for storing sales records
CREATE TABLE IF NOT EXISTS sale (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id VARCHAR(50) NOT NULL UNIQUE,
  sale_date DATE NOT NULL,
  party_name VARCHAR(255) NOT NULL,
  sale_pieces DECIMAL(10,2) NOT NULL,
  sale_rate DECIMAL(10,2) NOT NULL,
  discount DECIMAL(5,2) DEFAULT 0,
  sale_total DECIMAL(10,2) NOT NULL,
  design_code VARCHAR(50),
  design_name VARCHAR(255),
  barcode VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Add index for faster queries
CREATE INDEX idx_sale_date ON sale(sale_date);
CREATE INDEX idx_party_name ON sale(party_name);
CREATE INDEX idx_design_code ON sale(design_code);
