'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portfolios as portfolioApi } from '@/lib/api';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Input,
  Label,
} from '@opacore/ui';
import { Plus, Wallet, Trash2 } from 'lucide-react';

export default function PortfoliosPage() {
  const queryClient = useQueryClient();
  const { data: portfolios, isLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfolioApi.list(),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const createPortfolio = useMutation({
    mutationFn: (data: { name: string; description?: string }) => portfolioApi.create(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      setShowCreate(false);
      setName('');
      setDescription('');
    },
  });

  const deletePortfolio = useMutation({
    mutationFn: (id: string) => portfolioApi.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Portfolios</h1>
          <p className="text-muted-foreground">Organize your Bitcoin holdings</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Portfolio
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Create Portfolio</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createPortfolio.mutate({ name, description: description || undefined });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Cold Storage, Exchange, DCA"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Input
                  id="description"
                  placeholder="What is this portfolio for?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <Button type="submit" disabled={createPortfolio.isPending}>
                  {createPortfolio.isPending ? 'Creating...' : 'Create'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Loading portfolios...</p>
        </div>
      ) : !portfolios?.length ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20">
          <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">No portfolios yet</p>
          <Button variant="outline" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create your first portfolio
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {portfolios.map((portfolio) => (
            <Card key={portfolio.id} className="transition-colors hover:bg-accent/50">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <Link href={`/portfolios/${portfolio.id}`} className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <Wallet className="h-5 w-5 text-[hsl(var(--bitcoin))]" />
                      {portfolio.name}
                    </CardTitle>
                    {portfolio.description && (
                      <CardDescription>{portfolio.description}</CardDescription>
                    )}
                  </Link>
                  {confirmDeleteId === portfolio.id ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deletePortfolio.mutate(portfolio.id)}
                        disabled={deletePortfolio.isPending}
                      >
                        {deletePortfolio.isPending ? 'Deleting...' : 'Delete'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirmDeleteId(portfolio.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
