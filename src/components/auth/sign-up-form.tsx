'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Lock, Mail, User } from 'lucide-react';
import { signUpWithPasswordAction, type AuthActionState } from '@/app/(auth)/actions';

const initialState: AuthActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-sheen focus-visible:outline-accent mt-1 w-full rounded-xl bg-gradient-to-br from-accent to-accent-strong px-4 py-3 font-display text-sm font-bold text-white shadow-accent transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {pending ? 'Creating account…' : 'Create account'}
    </button>
  );
}

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpWithPasswordAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs font-bold tracking-wide text-faint uppercase">
        Full name
        <span className="relative">
          <User
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            name="fullName"
            type="text"
            autoComplete="name"
            required
            className="focus-visible:outline-accent w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-9 text-sm font-normal text-foreground normal-case focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </span>
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold tracking-wide text-faint uppercase">
        Email
        <span className="relative">
          <Mail
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="focus-visible:outline-accent w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-9 text-sm font-normal text-foreground normal-case focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </span>
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold tracking-wide text-faint uppercase">
        Password
        <span className="relative">
          <Lock
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="focus-visible:outline-accent w-full rounded-xl border border-line bg-surface py-2.5 pr-3 pl-9 text-sm font-normal text-foreground normal-case focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </span>
        <span className="mt-0.5 text-[11px] font-normal tracking-normal text-faint normal-case">
          At least 8 characters.
        </span>
      </label>
      {state.error ? (
        <p
          role="alert"
          className="rounded-xl bg-danger-wash px-3 py-2.5 text-xs font-medium text-danger"
        >
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
