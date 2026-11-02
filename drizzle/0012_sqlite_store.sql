DROP TABLE `operations`;--> statement-breakpoint
DROP TABLE `search_index`;--> statement-breakpoint
DROP TABLE `pages`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
DROP TABLE `threads`;--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` text NOT NULL
) STRICT;
--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`body` text NOT NULL,
	`tags` text NOT NULL,
	`revision` text NOT NULL,
	`excerpt` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`deleted_at` text
) STRICT;
--> statement-breakpoint
CREATE INDEX `pages_project` ON `pages` (`project_id`,`slug`);--> statement-breakpoint
CREATE TABLE `page_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`tags` text NOT NULL,
	`body` text NOT NULL,
	`revision` text NOT NULL,
	`actor` text NOT NULL,
	`summary` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
) STRICT;
--> statement-breakpoint
CREATE INDEX `page_versions_page` ON `page_versions` (`page_id`,`id`);--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`project_id` text NOT NULL,
	`status` text NOT NULL,
	`anchor_exact` text,
	`anchor_prefix` text,
	`anchor_suffix` text,
	`anchor_offset` integer,
	`recipients` text NOT NULL,
	`created_at` text NOT NULL
) STRICT;
--> statement-breakpoint
CREATE INDEX `threads_page` ON `threads` (`page_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`at` text NOT NULL,
	`edited_at` text
) STRICT;
--> statement-breakpoint
CREATE INDEX `messages_thread` ON `messages` (`thread_id`,`at`);--> statement-breakpoint
CREATE TABLE `search_docs` (
	`doc_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`page_id` text,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `search_docs_key` ON `search_docs` (`kind`,`id`);--> statement-breakpoint
CREATE INDEX `search_docs_page` ON `search_docs` (`page_id`);--> statement-breakpoint
CREATE VIRTUAL TABLE `search_index` USING fts5(
  `title`,
  `body`,
  content = 'search_docs',
  content_rowid = 'doc_id',
  tokenize = 'porter unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE VIRTUAL TABLE `search_trigram` USING fts5(
  `title`,
  `body`,
  content = 'search_docs',
  content_rowid = 'doc_id',
  tokenize = 'trigram'
);
--> statement-breakpoint
CREATE TRIGGER `search_docs_ai` AFTER INSERT ON `search_docs` BEGIN
  INSERT INTO `search_index`(rowid, title, body) VALUES (new.doc_id, new.title, new.body);
  INSERT INTO `search_trigram`(rowid, title, body) VALUES (new.doc_id, new.title, new.body);
END;
--> statement-breakpoint
CREATE TRIGGER `search_docs_ad` AFTER DELETE ON `search_docs` BEGIN
  INSERT INTO `search_index`(`search_index`, rowid, title, body) VALUES ('delete', old.doc_id, old.title, old.body);
  INSERT INTO `search_trigram`(`search_trigram`, rowid, title, body) VALUES ('delete', old.doc_id, old.title, old.body);
END;
--> statement-breakpoint
CREATE TRIGGER `search_docs_au` AFTER UPDATE ON `search_docs` BEGIN
  INSERT INTO `search_index`(`search_index`, rowid, title, body) VALUES ('delete', old.doc_id, old.title, old.body);
  INSERT INTO `search_trigram`(`search_trigram`, rowid, title, body) VALUES ('delete', old.doc_id, old.title, old.body);
  INSERT INTO `search_index`(rowid, title, body) VALUES (new.doc_id, new.title, new.body);
  INSERT INTO `search_trigram`(rowid, title, body) VALUES (new.doc_id, new.title, new.body);
END;
--> statement-breakpoint
CREATE TRIGGER `projects_search_ai` AFTER INSERT ON `projects` BEGIN
  INSERT INTO `search_docs`(kind, id, page_id, project_id, title, body)
    VALUES ('project', new.id, NULL, new.id, new.name, new.description)
    ON CONFLICT(kind, id) DO UPDATE SET title = excluded.title, body = excluded.body;
END;
--> statement-breakpoint
CREATE TRIGGER `projects_search_au` AFTER UPDATE OF `name`, `description` ON `projects` BEGIN
  INSERT INTO `search_docs`(kind, id, page_id, project_id, title, body)
    VALUES ('project', new.id, NULL, new.id, new.name, new.description)
    ON CONFLICT(kind, id) DO UPDATE SET title = excluded.title, body = excluded.body;
END;
--> statement-breakpoint
CREATE TRIGGER `projects_search_ad` AFTER DELETE ON `projects` BEGIN
  DELETE FROM `search_docs` WHERE kind = 'project' AND id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER `pages_search_ai` AFTER INSERT ON `pages` WHEN new.deleted_at IS NULL BEGIN
  INSERT INTO `search_docs`(kind, id, page_id, project_id, title, body)
    VALUES ('page', new.id, new.id, new.project_id, new.title, new.body)
    ON CONFLICT(kind, id) DO UPDATE SET title = excluded.title, body = excluded.body;
END;
--> statement-breakpoint
CREATE TRIGGER `pages_search_au` AFTER UPDATE OF `title`, `body`, `deleted_at` ON `pages` BEGIN
  DELETE FROM `search_docs` WHERE page_id = new.id AND new.deleted_at IS NOT NULL;
  INSERT INTO `search_docs`(kind, id, page_id, project_id, title, body)
    SELECT 'page', new.id, new.id, new.project_id, new.title, new.body WHERE new.deleted_at IS NULL
    ON CONFLICT(kind, id) DO UPDATE SET title = excluded.title, body = excluded.body;
  UPDATE `search_docs` SET title = new.title
    WHERE kind = 'thread' AND page_id = new.id AND title IS NOT new.title AND new.deleted_at IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `pages_search_ad` AFTER DELETE ON `pages` BEGIN
  DELETE FROM `search_docs` WHERE page_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER `threads_search_ai` AFTER INSERT ON `threads` BEGIN
  INSERT INTO `search_docs`(kind, id, page_id, project_id, title, body)
    SELECT 'thread', new.id, new.page_id, new.project_id, p.title, coalesce(new.anchor_exact, '')
    FROM `pages` p WHERE p.id = new.page_id AND p.deleted_at IS NULL
    ON CONFLICT(kind, id) DO UPDATE SET title = excluded.title, body = excluded.body;
END;
--> statement-breakpoint
CREATE TRIGGER `threads_search_ad` AFTER DELETE ON `threads` BEGIN
  DELETE FROM `search_docs` WHERE kind = 'thread' AND id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER `messages_search_ai` AFTER INSERT ON `messages` BEGIN
  INSERT INTO `search_docs`(kind, id, page_id, project_id, title, body)
    SELECT 'thread', t.id, t.page_id, t.project_id, p.title,
      coalesce(t.anchor_exact, '') || char(10) ||
      (SELECT coalesce(group_concat(m.body, char(10) ORDER BY m.at, m.id), '') FROM `messages` m WHERE m.thread_id = t.id)
    FROM `threads` t JOIN `pages` p ON p.id = t.page_id
    WHERE t.id = new.thread_id AND p.deleted_at IS NULL
    ON CONFLICT(kind, id) DO UPDATE SET title = excluded.title, body = excluded.body;
END;
--> statement-breakpoint
CREATE TRIGGER `messages_search_au` AFTER UPDATE OF `body` ON `messages` BEGIN
  INSERT INTO `search_docs`(kind, id, page_id, project_id, title, body)
    SELECT 'thread', t.id, t.page_id, t.project_id, p.title,
      coalesce(t.anchor_exact, '') || char(10) ||
      (SELECT coalesce(group_concat(m.body, char(10) ORDER BY m.at, m.id), '') FROM `messages` m WHERE m.thread_id = t.id)
    FROM `threads` t JOIN `pages` p ON p.id = t.page_id
    WHERE t.id = new.thread_id AND p.deleted_at IS NULL
    ON CONFLICT(kind, id) DO UPDATE SET title = excluded.title, body = excluded.body;
END;
--> statement-breakpoint
CREATE TRIGGER `messages_search_ad` AFTER DELETE ON `messages` BEGIN
  INSERT INTO `search_docs`(kind, id, page_id, project_id, title, body)
    SELECT 'thread', t.id, t.page_id, t.project_id, p.title,
      coalesce(t.anchor_exact, '') || char(10) ||
      (SELECT coalesce(group_concat(m.body, char(10) ORDER BY m.at, m.id), '') FROM `messages` m WHERE m.thread_id = t.id)
    FROM `threads` t JOIN `pages` p ON p.id = t.page_id
    WHERE t.id = old.thread_id AND p.deleted_at IS NULL
    ON CONFLICT(kind, id) DO UPDATE SET title = excluded.title, body = excluded.body;
END;
