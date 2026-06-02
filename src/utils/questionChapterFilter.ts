/**
 * PostgREST .or() filter matching questions that either live natively in the
 * given chapter or are explicitly shared into it via `shared_with`.
 */
export const questionChapterFilter = (chapterId: number | string) =>
  `chapter_id.eq.${chapterId},shared_with.cs.{${chapterId}}`;