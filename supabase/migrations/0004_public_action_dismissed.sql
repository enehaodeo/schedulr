-- 垃圾桶里的白板任务可以「彻底删除」：任务归发布者所有，读者删不掉原件，
-- 只记一条 dismissed，之后收件箱和垃圾桶都不再显示

alter table public.public_task_actions drop constraint public_task_actions_action_check;
alter table public.public_task_actions
  add constraint public_task_actions_action_check check (action in ('added', 'trashed', 'dismissed'));
