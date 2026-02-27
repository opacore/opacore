'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { verifyEmail } from '@/lib/auth';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@opacore/ui';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No verification token provided.');
      return;
    }

    verifyEmail(token)
      .then(() => {
        setStatus('success');
        setTimeout(() => router.push('/dashboard'), 2000);
      })
      .catch((err) => {
        setStatus('error');
        setError(
          err instanceof Error
            ? err.message
            : 'Verification failed. The link may have expired.'
        );
      });
  }, [token, router]);

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          {status === 'loading' && <Loader2 className="h-6 w-6 text-primary animate-spin" />}
          {status === 'success' && <CheckCircle className="h-6 w-6 text-green-500" />}
          {status === 'error' && <XCircle className="h-6 w-6 text-red-500" />}
        </div>
        <CardTitle className="text-2xl">
          {status === 'loading' && 'Verifying your email...'}
          {status === 'success' && 'Email verified!'}
          {status === 'error' && 'Verification failed'}
        </CardTitle>
        <CardDescription>
          {status === 'loading' && 'Please wait...'}
          {status === 'success' && 'Your account is now active. Redirecting to dashboard...'}
          {status === 'error' && error}
        </CardDescription>
      </CardHeader>
      {status === 'error' && (
        <CardContent className="text-center">
          <Link href="/login" className="text-primary hover:underline text-sm">
            Back to login
          </Link>
        </CardContent>
      )}
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Verifying...</p></div>}>
      <VerifyContent />
    </Suspense>
  );
}
