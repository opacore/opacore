'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@opacore/ui';
import { Button, Input, Label } from '@opacore/ui';
import { CheckCircle, XCircle } from 'lucide-react';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [isPending, setIsPending] = useState(false);

  if (!token) {
    return (
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-6 w-6 text-red-500" />
          </div>
          <CardTitle className="text-2xl">Invalid link</CardTitle>
          <CardDescription>This password reset link is missing a token.</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link href="/forgot-password" className="text-primary hover:underline text-sm">
            Request a new reset link
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (status === 'success') {
    return (
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <CardTitle className="text-2xl">Password updated</CardTitle>
          <CardDescription>Your password has been reset successfully.</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button onClick={() => router.push('/login')} className="w-full">
            Sign In
          </Button>
        </CardContent>
      </Card>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setIsPending(true);
    try {
      await auth.resetPassword(token, newPassword);
      setStatus('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Reset failed. The link may have expired.';
      setError(msg);
      setStatus('error');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Set new password</CardTitle>
        <CardDescription>Choose a strong password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
              {status === 'error' && (
                <span className="ml-1">
                  <Link href="/forgot-password" className="underline">Request a new link.</Link>
                </span>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new">New Password</Label>
            <Input
              id="new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm Password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Updating...' : 'Reset Password'}
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Loading...</p></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
