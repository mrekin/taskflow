'use client';

import { useState, useEffect, useRef } from 'react';
import { EyeOff, Loader2, Search, User as UserIcon, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { api } from '@/lib/api-utils';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface IgnoredUser {
  id: string;
  name: string | null;
  image: string | null;
}

interface UserOption {
  id: string;
  name: string | null;
  email: string | null;
  label: string;
}

export function IgnoredUsersSection() {
  const [ignored, setIgnored] = useState<IgnoredUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<UserOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(api('/api/user/ignored-users'))
      .then((res) => (res.ok ? res.json() : []))
      .then(setIgnored)
      .catch(() => toast.error('Failed to load ignored users'))
      .finally(() => setLoading(false));
  }, []);

  // Debounced user search for the "add" input
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(api(`/api/users/search?q=${encodeURIComponent(trimmed)}`))
        .then((res) => (res.ok ? res.json() : []))
        .then((users: UserOption[]) => setSuggestions(users))
        .catch(() => setSuggestions([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSuggestions([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAdd = async (user: UserOption) => {
    setAddingId(user.id);
    try {
      const res = await fetch(api('/api/user/ignored-users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to ignore user');
        return;
      }
      setIgnored(data);
      setQuery('');
      setSuggestions([]);
      toast.success(`Ignored ${user.label}`);
    } catch {
      toast.error('Failed to ignore user');
    } finally {
      setAddingId(null);
    }
  };

  const handleRemove = async (user: IgnoredUser) => {
    setRemovingId(user.id);
    try {
      const res = await fetch(api(`/api/user/ignored-users?userId=${encodeURIComponent(user.id)}`), {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to unignore user');
        return;
      }
      setIgnored(data);
    } catch {
      toast.error('Failed to unignore user');
    } finally {
      setRemovingId(null);
    }
  };

  const ignoredIds = new Set(ignored.map((u) => u.id));
  const available = suggestions.filter((s) => !ignoredIds.has(s.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <EyeOff className="h-4 w-4 text-primary" />
          Ignored Users
        </CardTitle>
        <CardDescription>
          Entities (tasks, notes, projects, tags, comments) owned by ignored users are hidden from your lists and the
          tag panel. Direct links to their entities still work.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          ignored.length > 0 && (
            <div className="space-y-1.5">
              {ignored.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-2.5 rounded-md border px-2.5 py-1.5"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-[10px] font-semibold bg-muted">
                      {user.name
                        ? user.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)
                        : <UserIcon className="h-3 w-3" />}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm flex-1 min-w-0 truncate">
                    {user.name || <span className="text-muted-foreground italic">Unknown user</span>}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    onClick={() => handleRemove(user)}
                    disabled={removingId === user.id}
                    aria-label="Stop ignoring"
                  >
                    {removingId === user.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )
        )}

        <div ref={containerRef} className="relative">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Add user to ignore list..."
              className="h-8 pl-8 text-sm"
            />
            {searching && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>

          {available.length > 0 && (
            <div className="absolute top-full left-0 mt-1 z-50 w-full bg-popover border rounded-md shadow-md py-1 max-h-[200px] overflow-y-auto">
              {available.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 text-sm text-left hover:bg-accent transition-colors"
                  onClick={() => handleAdd(user)}
                  disabled={addingId === user.id}
                >
                  <UserIcon className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{user.label}</span>
                  {addingId === user.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                </button>
              ))}
            </div>
          )}
          {query.trim() && !searching && available.length === 0 && (
            <div className="absolute top-full left-0 mt-1 z-50 w-full bg-popover border rounded-md shadow-md py-2 px-2.5 text-xs text-muted-foreground">
              No users found (users may hide their profiles from search)
            </div>
          )}
        </div>

        <p className={cn('text-xs text-muted-foreground')}>
          The ignored user is not notified. Manage the list here at any time.
        </p>
      </CardContent>
    </Card>
  );
}
