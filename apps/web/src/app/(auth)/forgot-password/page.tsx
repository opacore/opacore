'use client';

import { useState } from 'react';
import Link from 'next/link';
import { auth } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@opacore/ui';
import { Button, Input, Label } from '@opacore/ui';
import { CheckCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsPending(true);
    try {
      await auth.forgotPassword(email);
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsPending(false);
    }
  }

  if (submitted) {
    return (
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <CardTitle className="text-2xl">Check your email</CardTitle>
          <CardDescription>
            If an account exists for <strong>{email}</strong>, we&apos;ve sent a password reset link. Check your inbox — the link expires in 1 hour.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link href="/login" className="text-primary hover:underline text-sm">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Forgot your password?</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a reset link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Sending...' : 'Send Reset Link'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <Link href="/login" className="text-sm text-muted-foreground hover:underline">
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
