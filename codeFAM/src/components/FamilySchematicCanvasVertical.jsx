import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { resolveMemberImageUrl } from '@/lib/memberImageFallbacks';

function normalizeGeneration(generation) {
  if (generation === null || generation === undefined || generation === '') return null;
  const parsed = Number(generation);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeName(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/[״“”]/g, '"')
    .replace(/[׳‘’]/g, "'")
    .trim();
}

function formatDisplayName(value) {
  return normalizeName(value)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[0-9]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .trim();
}

function sortMembers(a, b) {
  if (a.birth_date && b.birth_date) {
    const dateDiff = new Date(a.birth_date) - new Date(b.birth_date);
    if (dateDiff !== 0) return dateDiff;
  }

  if (a.birth_year && b.birth_year) {
    const yearDiff = Number(a.birth_year) - Number(b.birth_year);
    if (yearDiff !== 0) return yearDiff;
  }

  return String(a.name || '').localeCompare(String(b.name || ''), 'he');
}

function isFemale(member) {
  const value = String(member?.gender || '').toLowerCase();
  return value === 'נקבה' || value === 'female';
}

function toCardClass(member, selectedMemberId, kind) {
  const genderClass = isFemale(member) ? 'female' : 'male';
  const activeClass = selectedMemberId === member.id ? 'active' : '';
  return `${kind} ${genderClass} ${activeClass}`.trim();
}

function splitNameLines(name, hasDateOfDeath) {
  const cleaned = formatDisplayName(name);
  if (!cleaned) {
    return { firstName: '', lastName: hasDateOfDeath ? 'ז"ל' : '' };
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const firstName = tokens[0] || '';
  const baseLastName = tokens.length > 1 ? tokens.slice(1).join(' ') : '';
  const lastName = hasDateOfDeath
    ? `${baseLastName}${baseLastName ? ' ' : ''}ז"ל`
    : baseLastName;

  return { firstName, lastName };
}

function memberInitials(name) {
  const words = String(formatDisplayName(name) || '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '👤';
  return words.slice(0, 2).map((part) => part[0]).join('');
}

function MemberPhoto({ member }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = resolveMemberImageUrl(member?.image_url);
  const hasImage = imageUrl && !imageFailed;
  const displayName = member?.date_of_death ? `${formatDisplayName(member.name)} ז"ל` : formatDisplayName(member?.name);

  return (
    <span className="schematic-photo-frame">
      {hasImage ? (
        <img
          src={imageUrl}
          alt={`תמונה של ${displayName}`}
          className="schematic-photo"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="schematic-photo-placeholder">{memberInitials(member?.name)}</span>
      )}
    </span>
  );
}

function pairKeyFromMembers(pair) {
  return pair
    .map((member) => member.id)
    .filter(Boolean)
    .sort()
    .join('|');
}

function familyTitle(parents) {
  const names = parents.map((member) => formatDisplayName(member.name)).filter(Boolean);
  if (names.length === 0) return 'משפחה';
  return `משפחת ${names.join(' ו')}`;
}

function pickParentCandidate(candidates, childGeneration) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  if (typeof childGeneration === 'number') {
    const oneGenerationAbove = candidates.filter((candidate) => {
      return normalizeGeneration(candidate.generation) === childGeneration - 1;
    });
    if (oneGenerationAbove.length === 1) return oneGenerationAbove[0];
    if (oneGenerationAbove.length > 1) return oneGenerationAbove.sort(sortMembers)[0];
  }

  return [...candidates].sort(sortMembers)[0];
}

function getSecondarySpousesForLead(pair, membersById) {
  if (!Array.isArray(pair) || pair.length === 0) return [];
  const lead = pair[0];
  if (!lead || !Array.isArray(lead.secondary_spouse_ids)) return [];
  const pairIds = new Set(pair.map((member) => member.id));

  return lead.secondary_spouse_ids
    .map((id) => membersById[id])
    .filter((member) => member && !pairIds.has(member.id));
}

function clampZoom(value) {
  return Math.min(2.2, Math.max(0.2, value));
}

function touchDistance(touchA, touchB) {
  return Math.hypot(touchA.clientX - touchB.clientX, touchA.clientY - touchB.clientY);
}

function touchCenter(touchA, touchB) {
  return {
    x: (touchA.clientX + touchB.clientX) / 2,
    y: (touchA.clientY + touchB.clientY) / 2,
  };
}

function PairRow({ pair, selectedMemberId, membersById, onSelectMember, cardClassName, cardSizeClassName = '', rowRef }) {
  const isGen3Pair = pair.some((member) => normalizeGeneration(member.generation) === 3);
  const secondarySpouses = getSecondarySpousesForLead(pair, membersById);

  return (
    <div
      ref={rowRef}
      className={`schematic-canvas-pair-row ${isGen3Pair ? 'schematic-canvas-pair-row-gen3' : ''}`.trim()}
    >
      {secondarySpouses.map((spouse) => {
        const spouseName = splitNameLines(spouse.name, Boolean(spouse.date_of_death));
        return (
          <React.Fragment key={`secondary_${pair[0]?.id || 'lead'}_${spouse.id}`}>
            <button
              type="button"
              className={`${toCardClass(spouse, selectedMemberId, cardClassName)} schematic-vertical-card ${cardSizeClassName}`.trim()}
              onClick={() => onSelectMember && onSelectMember(spouse.id)}
            >
              <MemberPhoto member={spouse} />
              <strong className="schematic-vertical-name">
                <span className="schematic-vertical-given">{spouseName.firstName || '\u00A0'}</span>
                <span className="schematic-vertical-family">{spouseName.lastName || '\u00A0'}</span>
              </strong>
            </button>
            <span className="schematic-spouse-dash" />
          </React.Fragment>
        );
      })}
      {pair.map((member, index) => {
        const { firstName, lastName } = splitNameLines(member.name, Boolean(member.date_of_death));

        return (
          <React.Fragment key={member.id}>
            <button
              type="button"
              className={`${toCardClass(member, selectedMemberId, cardClassName)} schematic-vertical-card ${cardSizeClassName}`.trim()}
              data-descendant-anchor={index === 0 ? 'true' : undefined}
              onClick={() => onSelectMember && onSelectMember(member.id)}
            >
              <MemberPhoto member={member} />
              <strong className="schematic-vertical-name">
                <span className="schematic-vertical-given">{firstName || '\u00A0'}</span>
                <span className="schematic-vertical-family">{lastName || '\u00A0'}</span>
              </strong>
            </button>
            {index === 0 && pair.length > 1 && <span className="schematic-heart">♡</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function CoupleTreeNode({ node, depth, selectedMemberId, membersById, onSelectMember }) {
  const cardClassName = depth === 0 ? 'schematic-person-card' : 'schematic-child-card';
  const sizeClassName = depth >= 3 ? 'schematic-canvas-gen3-card' : '';
  const isGen3ChildrenRow = node.children.some((childNode) => {
    return childNode.pair.some((member) => normalizeGeneration(member.generation) === 3);
  });
  const nodeRef = useRef(null);
  const pairRowRef = useRef(null);
  const childrenRowRef = useRef(null);
  const [lineMetrics, setLineMetrics] = useState({ start: 0, width: 0 });

  const recomputeChildrenRowLine = useCallback(() => {
    const row = childrenRowRef.current;
    if (!row) return;
    const branches = Array.from(row.children).filter((element) => {
      return element.classList?.contains('schematic-canvas-branch');
    });
    if (branches.length === 0) {
      setLineMetrics({ start: 0, width: 0 });
      return;
    }
    const centers = branches.map((branch) => {
      const anchorCard = branch.querySelector('.schematic-canvas-pair-row [data-descendant-anchor="true"]');
      if (!anchorCard) return branch.offsetLeft + branch.offsetWidth / 2;
      const branchRect = branch.getBoundingClientRect();
      const anchorRect = anchorCard.getBoundingClientRect();
      const anchorOffset = anchorRect.left + anchorRect.width / 2 - branchRect.left;
      return branch.offsetLeft + anchorOffset;
    });
    const start = Math.min(...centers);
    const end = Math.max(...centers);
    const width = Math.max(0, end - start);
    setLineMetrics((prev) => {
      if (Math.abs(prev.start - start) < 0.5 && Math.abs(prev.width - width) < 0.5) {
        return prev;
      }
      return { start, width };
    });
  }, []);

  useLayoutEffect(() => {
    if (node.children.length === 0) return undefined;
    recomputeChildrenRowLine();
    const row = childrenRowRef.current;
    if (!row || typeof ResizeObserver === 'undefined') return undefined;
    const resizeObserver = new ResizeObserver(() => {
      recomputeChildrenRowLine();
    });
    resizeObserver.observe(row);
    Array.from(row.children).forEach((childEl) => resizeObserver.observe(childEl));
    return () => resizeObserver.disconnect();
  }, [node.children.length, recomputeChildrenRowLine]);

  useLayoutEffect(() => {
    const nodeElement = nodeRef.current;
    const pairRowElement = pairRowRef.current;
    const branchElement = nodeElement?.closest('.schematic-canvas-branch');
    if (!nodeElement || !pairRowElement || !branchElement) return undefined;

    const updateStemAnchor = () => {
      const anchorCard = pairRowElement.querySelector('[data-descendant-anchor="true"]');
      if (!anchorCard) {
        branchElement.style.removeProperty('--branch-stem-left');
        return;
      }
      const branchRect = branchElement.getBoundingClientRect();
      const anchorRect = anchorCard.getBoundingClientRect();
      const anchorCenter = anchorRect.left + anchorRect.width / 2 - branchRect.left;
      branchElement.style.setProperty('--branch-stem-left', `${anchorCenter}px`);
    };

    updateStemAnchor();
    const onResize = () => updateStemAnchor();
    window.addEventListener('resize', onResize);

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateStemAnchor();
      });
      resizeObserver.observe(branchElement);
      resizeObserver.observe(pairRowElement);
      const anchorCard = pairRowElement.querySelector('[data-descendant-anchor="true"]');
      if (anchorCard) resizeObserver.observe(anchorCard);
    }

    return () => {
      window.removeEventListener('resize', onResize);
      if (resizeObserver) resizeObserver.disconnect();
      branchElement.style.removeProperty('--branch-stem-left');
    };
  }, [node.key, node.pair.length]);

  return (
    <section className="schematic-canvas-node" ref={nodeRef}>
      <PairRow
        pair={node.pair}
        selectedMemberId={selectedMemberId}
        membersById={membersById}
        onSelectMember={onSelectMember}
        cardClassName={cardClassName}
        cardSizeClassName={sizeClassName}
        rowRef={pairRowRef}
      />

      {node.children.length > 0 ? (
        <>
          <div className="schematic-canvas-stem" />
          <div
            ref={childrenRowRef}
            className={`schematic-canvas-children-row ${isGen3ChildrenRow ? 'schematic-canvas-children-row-gen3' : ''}`.trim()}
            style={{
              '--row-line-start': `${lineMetrics.start}px`,
              '--row-line-width': `${lineMetrics.width}px`,
            }}
          >
            {node.children.map((childNode) => (
              <article
                className={`schematic-canvas-branch ${isGen3ChildrenRow ? 'schematic-canvas-branch-gen3' : ''}`.trim()}
                key={childNode.key}
              >
                <CoupleTreeNode
                  node={childNode}
                  depth={depth + 1}
                  selectedMemberId={selectedMemberId}
                  membersById={membersById}
                  onSelectMember={onSelectMember}
                />
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

export default function FamilySchematicCanvasVertical({ members, selectedMemberId, onSelectMember, mobileCompact = false }) {
  const [zoom, setZoom] = useState(1);
  const viewportRef = useRef(null);
  const previousZoomRef = useRef(1);
  const didInitialCenterRef = useRef(false);
  const rafCenterRef = useRef(0);
  const timeoutCenterRef = useRef(0);
  const selectedRafRef = useRef(0);
  const selectedTimeoutRef = useRef(0);
  const pinchStateRef = useRef(null);
  const dragStateRef = useRef(null);
  const zoomRef = useRef(1);

  const membersById = useMemo(() => {
    return Object.fromEntries(members.map((member) => [member.id, member]));
  }, [members]);

  const membersByName = useMemo(() => {
    const map = new Map();
    members.forEach((member) => {
      const key = normalizeName(member.name);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(member);
    });
    return map;
  }, [members]);

  const resolveParentsForMember = useCallback((member) => {
    const resolved = [];
    const pushUnique = (candidate) => {
      if (!candidate) return;
      if (!resolved.some((existing) => existing.id === candidate.id)) {
        resolved.push(candidate);
      }
    };

    if (member.father_id) {
      pushUnique(membersById[member.father_id]);
    } else {
      const fatherCandidates = membersByName.get(normalizeName(member.father_name)) || [];
      pushUnique(pickParentCandidate(fatherCandidates, normalizeGeneration(member.generation)));
    }

    if (member.mother_id) {
      pushUnique(membersById[member.mother_id]);
    } else {
      const motherCandidates = membersByName.get(normalizeName(member.mother_name)) || [];
      pushUnique(pickParentCandidate(motherCandidates, normalizeGeneration(member.generation)));
    }

    return resolved.sort(sortMembers);
  }, [membersById, membersByName]);

  const findSpouse = useCallback((member) => {
    if (!member) return null;
    if (member.spouse_id && membersById[member.spouse_id]) {
      return membersById[member.spouse_id];
    }

    return members.find((candidate) => {
      if (candidate.id === member.id) return false;
      return candidate.spouse_id === member.id;
    }) || null;
  }, [members, membersById]);

  const createPairForMember = useCallback((member) => {
    const spouse = findSpouse(member);
    if (!spouse) return [member];
    const generation = normalizeGeneration(member.generation);
    if (generation !== null && generation >= 1) {
      // For descendants (generation 1+), keep the descendant first (right in RTL),
      // then spouse on the left.
      return [member, spouse];
    }
    return [member, spouse].sort(sortMembers);
  }, [findSpouse]);

  const { rootNode } = useMemo(() => {
    const childrenByCouple = new Map();
    const coupleByKey = new Map();

    const registerPair = (pair, preferredLeadId = null) => {
      let cleanPair = pair.filter(Boolean);
      if (cleanPair.length === 0) return null;

      if (preferredLeadId && cleanPair.length > 1) {
        const leadIndex = cleanPair.findIndex((member) => member.id === preferredLeadId);
        if (leadIndex > 0) {
          const lead = cleanPair[leadIndex];
          cleanPair = [lead, ...cleanPair.filter((_, index) => index !== leadIndex)];
        }
      }

      const key = pairKeyFromMembers(cleanPair);
      if (!key) return null;
      if (!coupleByKey.has(key)) {
        coupleByKey.set(key, cleanPair);
      } else if (preferredLeadId) {
        const currentPair = coupleByKey.get(key) || [];
        if (currentPair.length > 1) {
          const leadIndex = currentPair.findIndex((member) => member.id === preferredLeadId);
          if (leadIndex > 0) {
            const lead = currentPair[leadIndex];
            coupleByKey.set(key, [lead, ...currentPair.filter((_, index) => index !== leadIndex)]);
          }
        }
      }
      return key;
    };

    members.forEach((member) => {
      registerPair(createPairForMember(member));
    });

    members.forEach((child) => {
      const parents = resolveParentsForMember(child);
      if (parents.length === 0) return;

      const parentKey = registerPair(parents);
      if (!parentKey) return;
      if (!childrenByCouple.has(parentKey)) {
        childrenByCouple.set(parentKey, new Map());
      }
      childrenByCouple.get(parentKey).set(child.id, child);
    });

    const genZeroMembers = members
      .filter((member) => normalizeGeneration(member.generation) === 0)
      .sort(sortMembers);

    let rootPair = null;
    if (genZeroMembers.length > 0) {
      rootPair = createPairForMember(genZeroMembers[0]);
      if (genZeroMembers.length > 1) {
        const second = genZeroMembers[1];
        if (!rootPair.some((member) => member.id === second.id)) {
          rootPair = [genZeroMembers[0], second].sort(sortMembers);
        }
      }
    } else {
      rootPair = [...members].sort(sortMembers).slice(0, 2);
    }

    const rootKey = registerPair(rootPair);
    if (!rootKey) return { rootNode: null };

    const collectChildrenMembers = (coupleKey, pair) => {
      const childrenMap = new Map(childrenByCouple.get(coupleKey) || []);
      const lead = pair[0];
      if (!lead || !Array.isArray(lead.secondary_spouse_ids) || lead.secondary_spouse_ids.length === 0) {
        return [...childrenMap.values()].sort(sortMembers);
      }

      lead.secondary_spouse_ids.forEach((secondarySpouseId) => {
        const secondarySpouse = membersById[secondarySpouseId];
        if (!secondarySpouse) return;
        const secondaryKey = pairKeyFromMembers([lead, secondarySpouse]);
        if (!secondaryKey || secondaryKey === coupleKey) return;
        const secondaryChildren = childrenByCouple.get(secondaryKey);
        if (!secondaryChildren) return;
        secondaryChildren.forEach((child, childId) => {
          childrenMap.set(childId, child);
        });
      });

      return [...childrenMap.values()].sort(sortMembers);
    };

    const buildNode = (coupleKey, depth = 0, path = new Set()) => {
      const pair = coupleByKey.get(coupleKey) || [];
      const childrenMembers = collectChildrenMembers(coupleKey, pair);
      const seen = new Set();
      const childNodes = [];
      const nextPath = new Set(path);
      nextPath.add(coupleKey);

      for (const child of childrenMembers) {
        const childPair = createPairForMember(child);
        const childKey = registerPair(childPair, child.id);
        if (!childKey || seen.has(childKey) || nextPath.has(childKey)) continue;
        seen.add(childKey);

        if (depth >= 7) {
          childNodes.push({
            key: childKey,
            pair: childPair,
            children: [],
          });
          continue;
        }

        childNodes.push(buildNode(childKey, depth + 1, nextPath));
      }

      return {
        key: coupleKey,
        pair,
        children: childNodes,
      };
    };

    return { rootNode: buildNode(rootKey) };
  }, [createPairForMember, members, membersById, resolveParentsForMember]);

  const centerViewport = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
  }, []);

  const centerViewportOnNextFrame = useCallback(() => {
    if (rafCenterRef.current) {
      cancelAnimationFrame(rafCenterRef.current);
    }
    rafCenterRef.current = requestAnimationFrame(() => {
      rafCenterRef.current = requestAnimationFrame(() => {
        centerViewport();
        rafCenterRef.current = 0;
      });
    });
  }, [centerViewport]);

  const centerViewportWithRetry = useCallback(() => {
    centerViewportOnNextFrame();
    if (timeoutCenterRef.current) {
      clearTimeout(timeoutCenterRef.current);
    }
    timeoutCenterRef.current = window.setTimeout(() => {
      centerViewportOnNextFrame();
      timeoutCenterRef.current = 0;
    }, 80);
  }, [centerViewportOnNextFrame]);

  const centerSelectedMemberCard = useCallback((behavior = 'smooth') => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const activeCard = viewport.querySelector('.schematic-person-card.active, .schematic-child-card.active');
    if (!activeCard) return;

    const viewportRect = viewport.getBoundingClientRect();
    const cardRect = activeCard.getBoundingClientRect();
    const deltaX = cardRect.left + cardRect.width / 2 - (viewportRect.left + viewportRect.width / 2);
    const deltaY = cardRect.top + cardRect.height / 2 - (viewportRect.top + viewportRect.height / 2);

    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
    viewport.scrollBy({ left: deltaX, top: deltaY, behavior });
  }, []);

  const centerSelectedOnNextFrame = useCallback((behavior = 'smooth') => {
    if (selectedRafRef.current) {
      cancelAnimationFrame(selectedRafRef.current);
    }
    selectedRafRef.current = requestAnimationFrame(() => {
      selectedRafRef.current = requestAnimationFrame(() => {
        centerSelectedMemberCard(behavior);
        selectedRafRef.current = 0;
      });
    });
  }, [centerSelectedMemberCard]);

  const centerSelectedWithRetry = useCallback((behavior = 'smooth') => {
    centerSelectedOnNextFrame(behavior);
    if (selectedTimeoutRef.current) {
      clearTimeout(selectedTimeoutRef.current);
    }
    selectedTimeoutRef.current = window.setTimeout(() => {
      centerSelectedOnNextFrame(behavior);
      selectedTimeoutRef.current = 0;
    }, 90);
  }, [centerSelectedOnNextFrame]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (!mobileCompact) return undefined;
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const stopBrowserZoom = (event) => {
      event.preventDefault();
    };

    const onTouchStart = (event) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        const [firstTouch, secondTouch] = event.touches;
        const center = touchCenter(firstTouch, secondTouch);
        const viewportRect = viewport.getBoundingClientRect();
        pinchStateRef.current = {
          distance: touchDistance(firstTouch, secondTouch),
          zoom: zoomRef.current,
          centerX: center.x - viewportRect.left,
          centerY: center.y - viewportRect.top,
          scrollLeft: viewport.scrollLeft,
          scrollTop: viewport.scrollTop,
        };
        dragStateRef.current = null;
        return;
      }

      if (event.touches.length === 1) {
        const touch = event.touches[0];
        dragStateRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          scrollLeft: viewport.scrollLeft,
          scrollTop: viewport.scrollTop,
        };
      }
    };

    const onTouchMove = (event) => {
      if (event.touches.length === 2 && pinchStateRef.current) {
        event.preventDefault();
        const [firstTouch, secondTouch] = event.touches;
        const pinchState = pinchStateRef.current;
        const nextDistance = touchDistance(firstTouch, secondTouch);
        if (pinchState.distance <= 0 || nextDistance <= 0) return;

        const nextZoom = clampZoom(pinchState.zoom * (nextDistance / pinchState.distance));
        const zoomRatio = nextZoom / pinchState.zoom;
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
        viewport.scrollLeft = Math.max(0, (pinchState.scrollLeft + pinchState.centerX) * zoomRatio - pinchState.centerX);
        viewport.scrollTop = Math.max(0, (pinchState.scrollTop + pinchState.centerY) * zoomRatio - pinchState.centerY);
        return;
      }

      if (event.touches.length === 1 && dragStateRef.current) {
        event.preventDefault();
        const touch = event.touches[0];
        viewport.scrollLeft = dragStateRef.current.scrollLeft + (dragStateRef.current.x - touch.clientX);
        viewport.scrollTop = dragStateRef.current.scrollTop + (dragStateRef.current.y - touch.clientY);
      }
    };

    const onTouchEnd = (event) => {
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        dragStateRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          scrollLeft: viewport.scrollLeft,
          scrollTop: viewport.scrollTop,
        };
        pinchStateRef.current = null;
        return;
      }

      if (event.touches.length === 0) {
        pinchStateRef.current = null;
        dragStateRef.current = null;
      }
    };

    const listenerOptions = { passive: false };
    viewport.addEventListener('touchstart', onTouchStart, listenerOptions);
    viewport.addEventListener('touchmove', onTouchMove, listenerOptions);
    viewport.addEventListener('touchend', onTouchEnd, listenerOptions);
    viewport.addEventListener('touchcancel', onTouchEnd, listenerOptions);
    viewport.addEventListener('gesturestart', stopBrowserZoom, listenerOptions);
    viewport.addEventListener('gesturechange', stopBrowserZoom, listenerOptions);
    viewport.addEventListener('gestureend', stopBrowserZoom, listenerOptions);

    return () => {
      viewport.removeEventListener('touchstart', onTouchStart, listenerOptions);
      viewport.removeEventListener('touchmove', onTouchMove, listenerOptions);
      viewport.removeEventListener('touchend', onTouchEnd, listenerOptions);
      viewport.removeEventListener('touchcancel', onTouchEnd, listenerOptions);
      viewport.removeEventListener('gesturestart', stopBrowserZoom, listenerOptions);
      viewport.removeEventListener('gesturechange', stopBrowserZoom, listenerOptions);
      viewport.removeEventListener('gestureend', stopBrowserZoom, listenerOptions);
    };
  }, [mobileCompact]);

  useLayoutEffect(() => {
    const previousZoom = previousZoomRef.current;
    if (!didInitialCenterRef.current) {
      centerViewportWithRetry();
      didInitialCenterRef.current = true;
    } else if (zoom < previousZoom) {
      centerViewportWithRetry();
    }
    previousZoomRef.current = zoom;
  }, [centerViewportWithRetry, zoom]);

  useLayoutEffect(() => {
    didInitialCenterRef.current = false;
    centerViewportWithRetry();
  }, [members.length, rootNode?.key, centerViewportWithRetry]);

  useLayoutEffect(() => {
    if (!selectedMemberId) return;
    centerSelectedWithRetry('smooth');
  }, [selectedMemberId, centerSelectedWithRetry]);

  useLayoutEffect(() => {
    return () => {
      if (rafCenterRef.current) {
        cancelAnimationFrame(rafCenterRef.current);
      }
      if (timeoutCenterRef.current) {
        clearTimeout(timeoutCenterRef.current);
      }
      if (selectedRafRef.current) {
        cancelAnimationFrame(selectedRafRef.current);
      }
      if (selectedTimeoutRef.current) {
        clearTimeout(selectedTimeoutRef.current);
      }
    };
  }, []);

  if (!rootNode) {
    return <p className="schematic-empty">אין מספיק נתונים ליצירת תרשים משטח.</p>;
  }

  const zoomPercent = Math.round(zoom * 100);

  return (
    <section className={mobileCompact ? 'schematic-canvas-root schematic-canvas-vertical-root schematic-canvas-mobile-pinch' : 'schematic-canvas-root schematic-canvas-vertical-root'}>
      <div className="schematic-canvas-toolbar">
        <strong>{familyTitle(rootNode.pair)}</strong>
        {!mobileCompact && (
          <div className="schematic-canvas-zoom-controls">
            <button type="button" onClick={() => setZoom((prev) => Math.min(2.2, prev + 0.1))}>+</button>
            <button type="button" onClick={() => setZoom((prev) => Math.max(0.2, prev - 0.1))}>-</button>
            <button type="button" onClick={() => setZoom(1)}>איפוס</button>
            <span>{zoomPercent}%</span>
          </div>
        )}
      </div>

      <div
        className="schematic-canvas-viewport"
        ref={viewportRef}
      >
        <div className="schematic-canvas-stage" style={{ transform: `scale(${zoom})` }}>
          <CoupleTreeNode
            node={rootNode}
            depth={0}
            selectedMemberId={selectedMemberId}
            membersById={membersById}
            onSelectMember={onSelectMember}
          />
        </div>
      </div>
    </section>
  );
}
