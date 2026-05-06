'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAppStore } from '@/store/app-store';
import { DEFAULT_COLORS } from '@/lib/constants';
import type { Tag } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { X, Tag as TagIcon, Loader2 } from 'lucide-react';

interface TagPickerProps {
  selectedTagIds: string[];
  onTagIdsChange: (tagIds: string[]) => void;
}

export function TagPicker({ selectedTagIds, onTagIdsChange }: TagPickerProps) {
  const { tags, createTag, fetchTags } = useAppStore();
  const [inputValue, setInputValue] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tags.length === 0) {
      fetchTags();
    }
  }, [tags.length, fetchTags]);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedTags = selectedTagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is Tag => t !== undefined);

  // Filtered suggestions: exclude already selected, filter by input
  const suggestions = useMemo(() => {
    const available = tags.filter((t) => !selectedTagIds.includes(t.id));
    if (!inputValue.trim()) return available;
    const query = inputValue.toLowerCase().trim();
    return available
      .filter((t) => t.name.toLowerCase().includes(query));
  }, [tags, selectedTagIds, inputValue]);

  const exactMatch = tags.find(
    (t) => t.name.toLowerCase() === inputValue.trim().toLowerCase() && !selectedTagIds.includes(t.id)
  );
  const canCreate = inputValue.trim().length > 0 && !exactMatch && !tags.some(
    (t) => t.name.toLowerCase() === inputValue.trim().toLowerCase()
  );

  const handleRemoveTag = (tagId: string) => {
    onTagIdsChange(selectedTagIds.filter((id) => id !== tagId));
  };

  const handleAddTag = (tagId: string) => {
    onTagIdsChange([...selectedTagIds, tagId]);
    setInputValue('');
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const handleCreateAndAdd = async () => {
    if (!inputValue.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const color = DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
      await createTag({ name: inputValue.trim(), color });
      // Find the newly created tag in the store
      const created = useAppStore
        .getState()
        .tags.find((t) => t.name === inputValue.trim());
      if (created) {
        onTagIdsChange([...selectedTagIds, created.id]);
      }
      setInputValue('');
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    } finally {
      setIsCreating(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !inputValue && selectedTagIds.length > 0) {
      // Remove last tag on backspace
      onTagIdsChange(selectedTagIds.slice(0, -1));
      return;
    }

    if (e.key === 'Escape') {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const maxIndex = suggestions.length + (canCreate ? 1 : 0) - 1;
      setHighlightedIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const maxIndex = suggestions.length + (canCreate ? 1 : 0) - 1;
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0) {
        if (highlightedIndex < suggestions.length) {
          handleAddTag(suggestions[highlightedIndex].id);
        } else if (canCreate) {
          handleCreateAndAdd();
        }
      } else if (exactMatch) {
        handleAddTag(exactMatch.id);
      } else if (canCreate) {
        handleCreateAndAdd();
      }
      return;
    }
  };

  return (
    <div ref={containerRef} className="flex flex-wrap items-center gap-1.5 relative">
      <TagIcon className="size-3.5 text-muted-foreground shrink-0" />

      {/* Selected tags with X buttons */}
      {selectedTags.map((tag) => (
        <Badge
          key={tag.id}
          className="gap-1 pr-1 border-0 font-medium"
          style={{ backgroundColor: tag.color, color: '#fff' }}
        >
          <span>{tag.name}</span>
          <button
            type="button"
            onClick={() => handleRemoveTag(tag.id)}
            className="ml-0.5 rounded-full p-0.5 hover:bg-white/20 transition-colors"
          >
            <X className="size-2.5" />
          </button>
        </Badge>
      ))}

      {/* Inline input for typing/autocomplete */}
      <div className="relative inline-flex">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedTags.length === 0 ? 'Add tag...' : ''}
          className="h-6 px-2 text-xs border-none shadow-none focus-visible:ring-0 p-0 w-[80px] min-w-[60px] bg-transparent placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Dropdown suggestions */}
      {showSuggestions && (suggestions.length > 0 || canCreate) && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded-md shadow-md py-1 min-w-[180px] max-w-[260px] max-h-[200px] overflow-y-auto">
          {/* Matching existing tags */}
          {suggestions.map((tag, i) => (
            <button
              key={tag.id}
              type="button"
              className={cn(
                'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-left hover:bg-accent transition-colors',
                highlightedIndex === i && 'bg-accent'
              )}
              onClick={() => handleAddTag(tag.id)}
              onMouseEnter={() => setHighlightedIndex(i)}
            >
              <span
                className="size-2.5 rounded-full shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              <span className="truncate flex-1">{tag.name}</span>
              <span className="text-muted-foreground text-[10px]">Enter</span>
            </button>
          ))}

          {/* Create new tag option */}
          {canCreate && (
            <button
              type="button"
              className={cn(
                'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-left hover:bg-accent transition-colors border-t mt-0.5 pt-1.5',
                highlightedIndex === suggestions.length && 'bg-accent'
              )}
              onClick={handleCreateAndAdd}
              onMouseEnter={() => setHighlightedIndex(suggestions.length)}
            >
              {isCreating ? (
                <Loader2 className="size-2.5 animate-spin text-muted-foreground" />
              ) : (
                <span className="size-2.5 rounded-full bg-primary/30 shrink-0" />
              )}
              <span className="truncate flex-1">
                Create <strong>&quot;{inputValue.trim()}&quot;</strong>
              </span>
              <span className="text-muted-foreground text-[10px]">Enter</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
