-- Seed the portfolio with the content that was already on the site.
INSERT INTO "projects" ("id", "section", "title", "position") VALUES
  (1, 'd3', 'Golden Cloud', 0),
  (2, 'd3', 'Starbucks Booth', 1);
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('projects', 'id'), (SELECT MAX("id") FROM "projects"));
--> statement-breakpoint
INSERT INTO "media" ("project_id", "url", "kind", "position") VALUES
  (1, '/media/golden-cloud.jpg', 'i', 0),
  (2, '/media/starbucks-booth.jpg', 'i', 0);
--> statement-breakpoint
INSERT INTO "links" ("name", "description", "badge", "url", "position") VALUES
  ('GitHub', 'Code & open source repositories', 'Dev', 'https://github.com/luzukodlaminii12-alt', 0),
  ('Facebook', 'Connect on Facebook', 'Social', '', 1),
  ('LinkedIn', 'Professional network & experience', 'Professional', '', 2),
  ('Instagram', 'Creative work & behind the scenes', 'Social', '', 3);
--> statement-breakpoint
INSERT INTO "settings" ("key", "value") VALUES
  ('email', 'luzukodlaminii12@gmail.com'),
  ('appUrl', ''),
  ('appTitle', 'WRATH / iDREAMIT'),
  ('appDescription', 'Custom hardware engineering synthesis, PCB prototyping, and co-founding partnership platform.'),
  ('appImage', '/media/wrath-idreamit.jpg');
