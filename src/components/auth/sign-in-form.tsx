'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signInWithPasswordAction, type AuthActionState } from '@/app/(auth)/actions';

const initialState: AuthActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="focus-visible:outline-accent w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent-strong disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

export function SignInForm() {
  const [state, formAction] = useActionState(signInWithPasswordAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        />
      </label>
      {state.error ? (
        <p
          role="alert"
          className="rounded-xl bg-danger-wash px-3 py-2 text-xs font-medium text-danger"
        >
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
