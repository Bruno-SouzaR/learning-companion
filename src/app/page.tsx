import { LearningAppShell } from '@/components/learning-app-shell';

/**
 * Root Application Page (React Server Component)
 *
 * Adheres to Modern Frontend Craft Iron Rule 1:
 * Server Component by default, delegating interactive state to the leaf shell.
 */
export default function HomePage() {
  return <LearningAppShell />;
}
