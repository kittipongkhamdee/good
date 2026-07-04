-- =============================================
-- ตาเบาวิทยา — Database Schema for Supabase
-- ระบบสะสมคะแนนความดีนักเรียน
-- =============================================

-- ── Extensions ──
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users (Supabase Auth + profile) ──
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username     TEXT UNIQUE NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
  fullname     TEXT NOT NULL,
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Students ──
CREATE TABLE IF NOT EXISTS students (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  student_code TEXT UNIQUE NOT NULL,        -- รหัสนักเรียน
  fullname     TEXT NOT NULL,
  class        TEXT NOT NULL,               -- ห้องเรียน เช่น ม.3/2
  total_points INTEGER DEFAULT 0,
  badge_level  TEXT DEFAULT 'ผู้เริ่มต้น',
  avatar_url   TEXT,
  qr_token     TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Teachers ──
CREATE TABLE IF NOT EXISTS teachers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  fullname     TEXT NOT NULL,
  subject      TEXT,                        -- วิชาที่สอน
  classes      TEXT[],                      -- ห้องที่รับผิดชอบ
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Good deed types ──
CREATE TABLE IF NOT EXISTS good_deed_types (
  id           SERIAL PRIMARY KEY,
  icon         TEXT DEFAULT '💚',
  name         TEXT UNIQUE NOT NULL,
  description  TEXT,
  points_min   INTEGER DEFAULT 5,
  points_max   INTEGER DEFAULT 20,
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Point logs ──
CREATE TABLE IF NOT EXISTS point_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id   UUID REFERENCES students(id) ON DELETE CASCADE,
  teacher_id   UUID REFERENCES teachers(id) ON DELETE SET NULL,
  deed_type_id INTEGER REFERENCES good_deed_types(id) ON DELETE SET NULL,
  points       INTEGER NOT NULL CHECK (points > 0),
  note         TEXT,
  verified     BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Rewards ──
CREATE TABLE IF NOT EXISTS rewards (
  id              SERIAL PRIMARY KEY,
  icon            TEXT DEFAULT '🎁',
  name            TEXT NOT NULL,
  description     TEXT,
  points_required INTEGER NOT NULL CHECK (points_required > 0),
  stock           INTEGER DEFAULT 0,
  image_url       TEXT,
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Reward requests (redemptions) ──
CREATE TABLE IF NOT EXISTS reward_requests (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID REFERENCES students(id) ON DELETE CASCADE,
  reward_id   INTEGER REFERENCES rewards(id) ON DELETE SET NULL,
  points_used INTEGER NOT NULL,
  status      TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_point_logs_student ON point_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_teacher ON point_logs(teacher_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_created ON point_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_students_code ON students(student_code);
CREATE INDEX IF NOT EXISTS idx_students_points ON students(total_points DESC);
CREATE INDEX IF NOT EXISTS idx_reward_requests_student ON reward_requests(student_id);

-- ── Function: update student points ──
CREATE OR REPLACE FUNCTION update_student_points(p_student_id UUID, p_points INTEGER)
RETURNS VOID AS $$
DECLARE
  new_total INTEGER;
  new_badge TEXT;
BEGIN
  UPDATE students SET total_points = total_points + p_points WHERE id = p_student_id
  RETURNING total_points INTO new_total;

  new_badge := CASE
    WHEN new_total >= 5000 THEN 'คนดีต้นแบบ'
    WHEN new_total >= 1000 THEN 'คนดีระดับสูง'
    WHEN new_total >= 500  THEN 'คนดีระดับกลาง'
    WHEN new_total >= 100  THEN 'คนดีระดับต้น'
    ELSE 'ผู้เริ่มต้น'
  END;

  UPDATE students SET badge_level = new_badge, updated_at = NOW() WHERE id = p_student_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Function: redeem reward ──
CREATE OR REPLACE FUNCTION redeem_reward(p_student_id UUID, p_reward_id INTEGER)
RETURNS VOID AS $$
DECLARE
  v_points INTEGER;
  v_student_pts INTEGER;
  v_stock INTEGER;
BEGIN
  SELECT points_required, stock INTO v_points, v_stock FROM rewards WHERE id = p_reward_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบรางวัลหรือปิดใช้งานแล้ว'; END IF;
  IF v_stock <= 0 THEN RAISE EXCEPTION 'สินค้าหมด'; END IF;

  SELECT total_points INTO v_student_pts FROM students WHERE id = p_student_id;
  IF v_student_pts < v_points THEN RAISE EXCEPTION 'คะแนนไม่เพียงพอ'; END IF;

  UPDATE students SET total_points = total_points - v_points, updated_at = NOW() WHERE id = p_student_id;
  UPDATE rewards SET stock = stock - 1 WHERE id = p_reward_id;
  INSERT INTO reward_requests(student_id, reward_id, points_used, status) VALUES (p_student_id, p_reward_id, v_points, 'approved');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Trigger: updated_at ──
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_students_updated_at BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================
-- Row Level Security (RLS)
-- =============================================

ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE students         ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE good_deed_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards          ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_requests  ENABLE ROW LEVEL SECURITY;

-- Helper: get current user role
CREATE OR REPLACE FUNCTION current_role_label()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE auth_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Users
CREATE POLICY "users_self"    ON users FOR SELECT USING (auth_id = auth.uid());
CREATE POLICY "admin_all_users" ON users FOR ALL USING (current_role_label() = 'admin');

-- Students: student sees own, teacher sees all, admin full
CREATE POLICY "student_view_own"   ON students FOR SELECT USING (
  user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  OR current_role_label() IN ('teacher', 'admin')
);
CREATE POLICY "admin_manage_students" ON students FOR ALL USING (current_role_label() = 'admin');

-- Deed types: everyone reads, admin writes
CREATE POLICY "read_deed_types"  ON good_deed_types FOR SELECT USING (true);
CREATE POLICY "admin_deed_types" ON good_deed_types FOR ALL USING (current_role_label() = 'admin');

-- Point logs: student sees own, teacher inserts own, admin all
CREATE POLICY "student_view_own_logs" ON point_logs FOR SELECT USING (
  student_id IN (SELECT id FROM students WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()))
  OR current_role_label() IN ('teacher', 'admin')
);
CREATE POLICY "teacher_insert_logs" ON point_logs FOR INSERT WITH CHECK (
  current_role_label() IN ('teacher', 'admin')
);
CREATE POLICY "admin_all_logs" ON point_logs FOR ALL USING (current_role_label() = 'admin');

-- Rewards: everyone reads, admin writes
CREATE POLICY "read_rewards"  ON rewards FOR SELECT USING (true);
CREATE POLICY "admin_rewards" ON rewards FOR ALL USING (current_role_label() = 'admin');

-- Reward requests: student sees own, admin all
CREATE POLICY "student_own_requests" ON reward_requests FOR SELECT USING (
  student_id IN (SELECT id FROM students WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()))
  OR current_role_label() = 'admin'
);
CREATE POLICY "student_insert_request" ON reward_requests FOR INSERT WITH CHECK (
  student_id IN (SELECT id FROM students WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()))
);

-- =============================================
-- Seed data (ข้อมูลตัวอย่าง)
-- =============================================

INSERT INTO good_deed_types (icon, name, description, points_min, points_max) VALUES
  ('🧹', 'เก็บขยะ',       'เก็บขยะในบริเวณโรงเรียน',    5,  15),
  ('👩‍🏫', 'ช่วยครู',        'ช่วยครูจัดการงานต่างๆ',      10, 20),
  ('🤝', 'ช่วยเพื่อน',    'ช่วยเพื่อนด้านการเรียนหรืองาน', 10, 20),
  ('🌿', 'จิตอาสา',       'กิจกรรมจิตอาสาต่างๆ',        15, 30),
  ('🎪', 'ร่วมกิจกรรม',  'เข้าร่วมกิจกรรมของโรงเรียน',  20, 50),
  ('💝', 'บริจาคสิ่งของ', 'บริจาคสิ่งของให้โรงเรียนหรือสังคม', 25, 50)
ON CONFLICT (name) DO NOTHING;

INSERT INTO rewards (icon, name, description, points_required, stock) VALUES
  ('📚', 'สมุดบันทึก',          'สมุดบันทึกคุณภาพดี',         100, 12),
  ('🎒', 'กระเป๋านักเรียน',   'กระเป๋านักเรียนโรงเรียน',    500, 3),
  ('🖊️', 'ชุดเครื่องเขียน',   'ชุดอุปกรณ์เครื่องเขียนครบชุด', 200, 8),
  ('🏅', 'เหรียญรางวัล',       'เหรียญรางวัลความดี',         300, 5),
  ('🎫', 'บัตรยกเว้นการบ้าน', 'ยกเว้นการบ้านได้ 1 ครั้ง',  150, 2),
  ('🍜', 'คูปองอาหาร',         'คูปองอาหารในโรงเรียน',        80, 20)
ON CONFLICT DO NOTHING;
