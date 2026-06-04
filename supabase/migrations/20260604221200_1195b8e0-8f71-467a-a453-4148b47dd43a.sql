ALTER TYPE public.questionnaire_question_type ADD VALUE IF NOT EXISTS 'image_upload';

ALTER TABLE public.questionnaire_answers
  ADD COLUMN IF NOT EXISTS uploaded_file_urls text[] NOT NULL DEFAULT '{}';