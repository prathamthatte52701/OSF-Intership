ALTER TABLE students ADD COLUMN profile_visible INTEGER NOT NULL DEFAULT 1 CHECK(profile_visible IN (0,1));
