-- Add an activation flag to recurring_rules to disable generation without deleting the rule.
begin;

alter table if exists recurring_rules
add column if not exists active boolean not null default true;

commit;
