-- Create support_tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create vlog_entries table
CREATE TABLE IF NOT EXISTS vlog_entries (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  video_url TEXT NOT NULL,
  thumbnail TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE vlog_entries ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable insert for all users" ON support_tickets
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable select for authenticated users" ON support_tickets
  FOR SELECT USING (true);

CREATE POLICY "Enable all for vlogs" ON vlog_entries
  FOR ALL USING (true);

-- Insert sample data
INSERT INTO vlog_entries (title, video_url, thumbnail) VALUES
  ('Funding Innovation 2026', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://img.youtube.com/vi/dQw4w9WgXcQ/0.jpg'),
  ('AI meets Venture Capital', 'https://www.youtube.com/embed/3JZ_D3ELwOQ', 'https://img.youtube.com/vi/3JZ_D3ELwOQ/0.jpg'),
  ('Startup Growth Hacks', 'https://www.youtube.com/embed/ScMzIvxBSi4', 'https://img.youtube.com/vi/ScMzIvxBSi4/0.jpg');

-- Create indexes for performance
CREATE INDEX idx_support_tickets_created_at ON support_tickets(created_at DESC);
CREATE INDEX idx_vlog_entries_created_at ON vlog_entries(created_at DESC);