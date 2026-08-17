'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signUpWithPasswordAction, type AuthActionState } from '@/app/(auth)/actions';

const initialState: AuthActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="focus-visible:outline-accent w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent-strong disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {pending ? 'Creating account…' : 'Create account'}
    </button>
  );
}

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpWithPasswordAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Full name</span>
        <input
          name="fullName"
          type="text"
          autoComplete="name"
          required
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        />
      </label>
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
          autoComplete="new-password"
          required
          minLength={8}
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        />
        <span className="text-xs text-faint">At least 8 characters.</span>
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
