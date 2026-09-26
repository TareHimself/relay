CREATE VIRTUAL TABLE `search_index` USING fts5(
  `kind` UNINDEXED,
  `id` UNINDEXED,
  `page_id` UNINDEXED,
  `project_id` UNINDEXED,
  `title`,
  `body`,
  tokenize = 'porter unicode61 remove_diacritics 2'
);
