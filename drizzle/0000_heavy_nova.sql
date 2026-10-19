CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`player` text NOT NULL,
	`day` integer NOT NULL,
	`title` text NOT NULL,
	`views` integer,
	`followers` integer,
	`note` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `polls` (
	`id` text PRIMARY KEY NOT NULL,
	`player` text NOT NULL,
	`day` integer NOT NULL,
	`options` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`poll_id` text NOT NULL,
	`voter_id` text NOT NULL,
	`choice` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`poll_id`, `voter_id`)
);
