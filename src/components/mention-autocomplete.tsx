'use client';

import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  type ReactNode,
  type TextareaHTMLAttributes,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store/app-store';
import { filterEntities, isLocalEntityUrl, type MentionItem, type UserMentionItem } from '@/lib/smart-links';
import { getEntityLink } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface MentionTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  children?: ReactNode;
}

const TYPE_ICONS: Record<string, string> = {
  task: 'T',
  project: 'P',
  note: 'N',
  area: 'A',
  user: '@',
};

const TYPE_LABELS: Record<string, string> = {
  task: 'Tasks',
  project: 'Projects',
  note: 'Notes',
  area: 'Areas',
  user: 'Users',
};

type DropdownItem = MentionItem | (UserMentionItem & { type: 'user' });

function isUserItem(item: DropdownItem): item is UserMentionItem & { type: 'user' } {
  return 'type' in item && item.type === 'user';
}

function getCaretCoordinates(textarea: HTMLTextAreaElement, position: number): { top: number; left: number } {
  const div = document.createElement('div');
  const style = window.getComputedStyle(textarea);

  const propsToCopy = [
    'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing',
    'lineHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'boxSizing', 'width', 'whiteSpace', 'wordWrap', 'tabSize',
  ];

  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.overflow = 'hidden';
  div.style.height = 'auto';

  for (const prop of propsToCopy) {
    div.style[prop as any] = style[prop as any];
  }

  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';

  const textContent = textarea.value.substring(0, position);
  div.textContent = textContent;

  const span = document.createElement('span');
  span.textContent = '\u200b';
  div.appendChild(span);

  document.body.appendChild(div);

  const spanRect = span.getBoundingClientRect();
  const divRect = div.getBoundingClientRect();

  const result = {
    top: spanRect.top - divRect.top,
    left: spanRect.left - divRect.left,
  };

  document.body.removeChild(div);
  return result;
}

function Dropdown({
  items,
  selectedIndex,
  viewportPos,
  onSelect,
  onHover,
}: {
  items: DropdownItem[];
  selectedIndex: number;
  viewportPos: { top: number; left: number };
  onSelect: (item: DropdownItem) => void;
  onHover: (idx: number) => void;
}) {
  const groupedItems = items.reduce<Record<string, DropdownItem[]>>((acc, item) => {
    const groupKey = isUserItem(item) ? 'user' : item.type;
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(item);
    return acc;
  }, {});

  const typeOrder = ['user', 'task', 'project', 'note', 'area'];

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selected = dropdownRef.current?.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div
      ref={dropdownRef}
      className="fixed z-[9999] min-w-[240px] max-w-[320px] bg-popover border border-border rounded-lg shadow-lg overflow-hidden"
      style={{ top: viewportPos.top, left: viewportPos.left }}
    >
      <div className="max-h-[280px] overflow-y-auto custom-scrollbar p-1">
        {typeOrder.map((type) => {
          const group = groupedItems[type];
          if (!group || group.length === 0) return null;

          return (
            <div key={type}>
              <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {TYPE_LABELS[type]}
              </div>
              {group.map((item) => {
                const globalIdx = items.indexOf(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-selected={globalIdx === selectedIndex}
                    className={cn(
                      'w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-2 transition-colors',
                      globalIdx === selectedIndex
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-muted'
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelect(item);
                    }}
                    onMouseEnter={() => onHover(globalIdx)}
                  >
                    <span className="shrink-0 text-primary font-mono text-[10px] font-semibold w-4 text-center">
                      {TYPE_ICONS[type]}
                    </span>
                    {isUserItem(item) ? (
                      <span className="truncate">{item.label}</span>
                    ) : (
                      <>
                        <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                          {item.shortId}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const basePath = process.env.NEXT_BASE_PATH || '';
const api = (path: string) => `${basePath}${path}`;

export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(
  function MentionTextarea({ value, onChange, children, className, onKeyDown, ...rest }, forwardedRef) {
    const innerRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(forwardedRef, () => innerRef.current!, []);

    const { tasks, projects, notes, areas } = useAppStore();

    const [isOpen, setIsOpen] = useState(false);
    const [triggerIndex, setTriggerIndex] = useState(-1);
    const [triggerType, setTriggerType] = useState<'#' | '@'>('#');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [viewportPos, setViewportPos] = useState({ top: 0, left: 0 });
    const [items, setItems] = useState<DropdownItem[]>([]);

    const isOpenRef = useRef(false);
    const userSearchAbortRef = useRef<AbortController | null>(null);

    const closeDropdown = useCallback(() => {
      setIsOpen(false);
      isOpenRef.current = false;
      if (userSearchAbortRef.current) {
        userSearchAbortRef.current.abort();
        userSearchAbortRef.current = null;
      }
    }, []);

    const updatePosition = useCallback(() => {
      const textarea = innerRef.current;
      if (!textarea) return;

      const cursorPos = textarea.selectionStart;
      const coords = getCaretCoordinates(textarea, cursorPos);
      const taRect = textarea.getBoundingClientRect();

      const scrollTop = textarea.scrollTop;
      const scrollLeft = textarea.scrollLeft;

      let top = taRect.top + coords.top - scrollTop + 20;
      let left = taRect.left + coords.left - scrollLeft;

      const estimatedHeight = 280;
      const estimatedWidth = 320;

      if (top + estimatedHeight > window.innerHeight) {
        top = taRect.top + coords.top - scrollTop - estimatedHeight - 4;
      }
      if (left + estimatedWidth > window.innerWidth) {
        left = window.innerWidth - estimatedWidth - 8;
      }

      top = Math.max(8, top);
      left = Math.max(8, left);

      setViewportPos({ top, left });
    }, []);

    const detectTrigger = useCallback(
      (val: string, cursorPos: number) => {
        const textBefore = val.substring(0, cursorPos);

        const hashIndex = textBefore.lastIndexOf('#');
        const atIndex = textBefore.lastIndexOf('@');

        let activeTrigger: '#' | '@' | null = null;
        let activeIndex = -1;

        if (atIndex > hashIndex) {
          const beforeAt = textBefore.substring(0, atIndex);
          if (beforeAt.length === 0 || /[\s\n\r]$/.test(beforeAt)) {
            activeTrigger = '@';
            activeIndex = atIndex;
          }
        }

        if (!activeTrigger && hashIndex !== -1) {
          const beforeHash = textBefore.substring(0, hashIndex);
          if (beforeHash.length === 0 || /[\s\n\r]$/.test(beforeHash)) {
            activeTrigger = '#';
            activeIndex = hashIndex;
          }
        }

        if (!activeTrigger || activeIndex === -1) {
          closeDropdown();
          return;
        }

        const q = textBefore.substring(activeIndex + 1);

        if (activeTrigger === '#') {
          setTriggerIndex(activeIndex);
          setTriggerType('#');
          const filtered = filterEntities(q, tasks, projects, notes, areas);
          setItems(filtered);
          setSelectedIndex(0);

          if (filtered.length > 0) {
            updatePosition();
            setIsOpen(true);
            isOpenRef.current = true;
          } else {
            closeDropdown();
          }
        } else if (activeTrigger === '@') {
          setTriggerIndex(activeIndex);
          setTriggerType('@');

          if (userSearchAbortRef.current) {
            userSearchAbortRef.current.abort();
          }
          const controller = new AbortController();
          userSearchAbortRef.current = controller;

          fetch(api(`/api/users/search?q=${encodeURIComponent(q)}`), { signal: controller.signal })
            .then((res) => res.ok ? res.json() : [])
            .then((users: UserMentionItem[]) => {
              if (controller.signal.aborted) return;
              const dropdownItems: DropdownItem[] = users.map((u) => ({ ...u, type: 'user' as const }));
              setItems(dropdownItems);
              setSelectedIndex(0);

              if (dropdownItems.length > 0) {
                updatePosition();
                setIsOpen(true);
                isOpenRef.current = true;
              } else {
                closeDropdown();
              }
            })
            .catch(() => {
              if (!controller.signal.aborted) {
                closeDropdown();
              }
            });
        }
      },
      [tasks, projects, notes, areas, closeDropdown, updatePosition]
    );

    const insertMention = useCallback(
      (item: DropdownItem) => {
        const textarea = innerRef.current;
        if (!textarea) return;

        const cursorPos = textarea.selectionStart;
        const before = value.substring(0, triggerIndex);
        const after = value.substring(cursorPos);

        let insertion: string;
        if (isUserItem(item)) {
          const identifier = item.name || item.email || item.label;
          insertion = `@${identifier} `;
        } else {
          const entityShortLinks = useAppStore.getState().userPreferences.entityShortLinks;
          insertion = entityShortLinks
            ? `#${item.shortId} `
            : `${window.location.origin}${getEntityLink(item.type, item.shortId)} `;
        }

        const newValue = before + insertion + after;
        onChange(newValue);
        closeDropdown();

        requestAnimationFrame(() => {
          const newPos = before.length + insertion.length;
          textarea.focus();
          textarea.setSelectionRange(newPos, newPos);
        });
      },
      [value, onChange, triggerIndex, closeDropdown]
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
        requestAnimationFrame(() => {
          if (innerRef.current) {
            detectTrigger(e.target.value, innerRef.current.selectionStart);
          }
        });
      },
      [onChange, detectTrigger]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (isOpen && items.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            setSelectedIndex((prev) => (prev + 1) % items.length);
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
            return;
          }
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            insertMention(items[selectedIndex]);
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeDropdown();
            return;
          }
        }

        onKeyDown?.(e);
      },
      [isOpen, items, selectedIndex, insertMention, onKeyDown, closeDropdown]
    );

    useLayoutEffect(() => {
      const handleNativeKeyDown = (e: KeyboardEvent) => {
        if (!isOpenRef.current) return;
        if (!innerRef.current) return;
        if (document.activeElement !== innerRef.current) return;
        if (e.key === 'Escape') {
          e.stopImmediatePropagation();
          e.preventDefault();
          closeDropdown();
        }
      };

      document.addEventListener('keydown', handleNativeKeyDown, true);
      return () => document.removeEventListener('keydown', handleNativeKeyDown, true);
    }, [closeDropdown]);

    useEffect(() => {
      if (!isOpen) return;

      const handleClickOutside = (e: MouseEvent) => {
        const textarea = innerRef.current;
        if (textarea && e.target !== textarea && !textarea.contains(e.target as Node)) {
          closeDropdown();
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, closeDropdown]);

    const portalContent = isOpen && items.length > 0
      ? createPortal(
          <Dropdown
            items={items}
            selectedIndex={selectedIndex}
            viewportPos={viewportPos}
            onSelect={insertMention}
            onHover={setSelectedIndex}
          />,
          document.body
        )
      : null;

    const ENTITY_URL_REPLACE_REGEX =
      /https?:\/\/[^\s<>)"']+?\?(?:[^\s<>)"']+&)*?(?:task|project|note|area)=([TPNAtpna])-(\d+)[^\s<>)"']*/gi;

    const handlePaste = useCallback(
      (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const entityShortLinks = useAppStore.getState().userPreferences.entityShortLinks;
        if (!entityShortLinks) return;

        const pasted = e.clipboardData.getData('text');
        if (!pasted) return;

        const transformed = pasted.replace(ENTITY_URL_REPLACE_REGEX, (match, type: string, num: string) => {
          if (!isLocalEntityUrl(match)) return match;
          return `#${type.toUpperCase()}-${num}`;
        });

        if (transformed !== pasted) {
          e.preventDefault();
          const textarea = innerRef.current;
          if (!textarea) return;

          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const newValue = value.substring(0, start) + transformed + value.substring(end);
          onChange(newValue);

          requestAnimationFrame(() => {
            const newPos = start + transformed.length;
            textarea.focus();
            textarea.setSelectionRange(newPos, newPos);
          });
        }
      },
      [value, onChange]
    );

    return (
      <>
        <textarea
          ref={innerRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className={cn(className)}
          {...rest}
        />
        {portalContent}
        {children}
      </>
    );
  }
);
