-- পুরনো ভার্সন থেকে আসলে আগে পরিষ্কার
alter table public.letters drop column if exists passcode;
drop function if exists public.find_letters(text);
drop function if exists public.open_letter(uuid, text);

-- ১. টেবিল
create table if not exists public.letters (
  id          uuid primary key default gen_random_uuid(),
  to_name     text not null check (char_length(to_name) between 1 and 60),
  from_name   text check (from_name is null or char_length(from_name) <= 60),
  body        text not null check (char_length(body) between 1 and 4000),
  is_public   boolean not null default false,
  author_id   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists letters_to_name_idx on public.letters (lower(to_name));
create index if not exists letters_public_idx  on public.letters (is_public, created_at desc);

-- ২. RLS
alter table public.letters enable row level security;

drop policy if exists "read public letters" on public.letters;
create policy "read public letters"
  on public.letters for select
  to anon, authenticated
  using (is_public = true);

drop policy if exists "insert letters" on public.letters;
create policy "insert letters"
  on public.letters for insert
  to anon, authenticated
  with check (true);

-- UPDATE / DELETE পলিসি নেই → RLS-এ দুটোই ব্লকড

-- ৩. ট্রিগার: চিরতরে লক
create or replace function public.block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'চিঠি একবার লেখা হলে পরিবর্তন বা মুছে ফেলা যায় না';
end $$;

drop trigger if exists letters_no_update on public.letters;
create trigger letters_no_update
  before update on public.letters
  for each row execute function public.block_mutation();

drop trigger if exists letters_no_delete on public.letters;
create trigger letters_no_delete
  before delete on public.letters
  for each row execute function public.block_mutation();

-- ৪. নাম সার্চ — মিলে গেলে বডিসহ ফেরত দেয়
create or replace function public.find_letters(p_name text)
returns table (
  id uuid,
  to_name text,
  from_name text,
  body text,
  is_public boolean,
  created_at timestamptz
)
language sql security definer stable set search_path = public as $$
  select l.id, l.to_name, l.from_name, l.body, l.is_public, l.created_at
  from public.letters l
  where lower(trim(l.to_name)) = lower(trim(p_name))
  order by l.created_at desc
  limit 100;
$$;

-- ৫. শেয়ার লিংক (#l=uuid) — আইডি দিয়ে একক চিঠি
create or replace function public.open_letter(p_id uuid)
returns table (
  to_name text,
  from_name text,
  body text,
  is_public boolean,
  created_at timestamptz
)
language sql security definer stable set search_path = public as $$
  select l.to_name, l.from_name, l.body, l.is_public, l.created_at
  from public.letters l
  where l.id = p_id;
$$;

grant execute on function public.find_letters(text) to anon, authenticated;
grant execute on function public.open_letter(uuid)  to anon, authenticated;
