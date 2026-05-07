'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api-utils';
import { X, User as UserIcon, Loader2 } from 'lucide-react';

interface UserOption {
  id: string;
  name: string | null;
  email: string | null;
  label: string;
}

interface UserPickerProps {
  assigneeId: string | null;
  assignee: UserOption | null | undefined;
  onAssigneeChange: (userId: string | null) => void;
}


export function UserPicker({ assigneeId, assignee, onAssigneeChange }: UserPickerProps) {
  const [inputValue, setInputValue] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (assignee) {
      setSelectedUser(assignee);
    } else if (!assigneeId) {
      setSelectedUser(null);
    }
  }, [assignee, assigneeId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchUsers = (query: string) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    const url = query
      ? api(`/api/users/search?q=${encodeURIComponent(query)}`)
      : api('/api/users/search');
    fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : []))
      .then((users: UserOption[]) => {
        if (controller.signal.aborted) return;
        setSuggestions(users);
        setShowSuggestions(true);
        setHighlightedIndex(-1);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      });
  };

  useEffect(() => {
    if (inputValue.trim().length > 0) {
      fetchUsers(inputValue.trim());
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [inputValue]);

  const displayLabel = useMemo(() => {
    if (!assigneeId) return null;
    if (selectedUser) {
      return selectedUser.name || selectedUser.email || selectedUser.label;
    }
    if (assignee) {
      return assignee.name || assignee.email || assignee.label;
    }
    return null;
  }, [assigneeId, selectedUser, assignee]);

  const handleSelect = (user: UserOption) => {
    setSelectedUser(user);
    onAssigneeChange(user.id);
    setInputValue('');
    setShowSuggestions(false);
    setHighlightedIndex(-1);
  };

  const handleClear = () => {
    setSelectedUser(null);
    onAssigneeChange(null);
    setInputValue('');
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const maxIndex = suggestions.length - 1;
      setHighlightedIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const maxIndex = suggestions.length - 1;
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        handleSelect(suggestions[highlightedIndex]);
      }
      return;
    }

    if (e.key === 'Backspace' && !inputValue && assigneeId) {
      handleClear();
      return;
    }
  };

  return (
    <div ref={containerRef} className="flex flex-wrap items-center gap-1.5 relative">
      <UserIcon className="size-3.5 text-muted-foreground shrink-0" />

      {assigneeId && displayLabel ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">
          <span>{displayLabel}</span>
          <button
            type="button"
            onClick={handleClear}
            className="ml-0.5 rounded-full p-0.5 hover:bg-secondary-foreground/10 transition-colors"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ) : null}

      <div className="relative inline-flex">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (assigneeId) {
              onAssigneeChange(null);
            }
          }}
          onFocus={() => {
            if (inputValue.trim()) {
              setShowSuggestions(true);
            } else {
              fetchUsers('');
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={assigneeId && displayLabel ? '' : 'Assign user...'}
          className="h-6 px-2 text-xs border-none shadow-none focus-visible:ring-0 p-0 w-[100px] min-w-[60px] bg-transparent placeholder:text-muted-foreground/50"
        />
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded-md shadow-md py-1 min-w-[180px] max-w-[260px] max-h-[200px] overflow-y-auto">
          {suggestions.map((user, i) => (
            <button
              key={user.id}
              type="button"
              className={cn(
                'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-left hover:bg-accent transition-colors',
                highlightedIndex === i && 'bg-accent'
              )}
              onClick={() => handleSelect(user)}
              onMouseEnter={() => setHighlightedIndex(i)}
            >
              <UserIcon className="size-3 text-muted-foreground shrink-0" />
              <span className="truncate flex-1">{user.label}</span>
              <span className="text-muted-foreground text-[10px]">Enter</span>
            </button>
          ))}
        </div>
      )}

      {isSearching && (
        <Loader2 className="size-3 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
