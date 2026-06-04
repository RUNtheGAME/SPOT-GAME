import React, { useEffect, useMemo, useState } from 'react';
import FamilySchematicDiagram from '@/components/FamilySchematicDiagram';
import FamilyWorldMap from '@/components/FamilyWorldMap';
import { RESOLVED_FAMILY_MEMBERS_SEED } from '@/data/familyMembersResolvedSeed';
import { ALBUM_FOLDERS_MANIFEST } from '@/data/albumFolders.generated';
import { formatDisplayName } from '@/lib/displayName';
import { applyMemberImageFallbacks, resolveMemberImageUrl } from '@/lib/memberImageFallbacks';
import { ArrowRight, Bell, Folder, GitBranch, House, Images, MapPinned, MessageCircle, Phone, Search, UserRound, Users, X } from 'lucide-react';
import treeIconUrl from './assets/tree.svg';
import listIconUrl from './assets/reshima.svg';

const LOCAL_MEMBERS_STORAGE_KEY = 'codeTAL2_local_members_v2';
const LOCAL_MEMBERS_SOURCE_VERSION = 'xlsx_2026_05_17_r2';
const MOBILE_BREAKPOINT_PX = 960;

const ALBUM_IMAGE_MODULES = {
  ...import.meta.glob('../albums/**/*.{png,jpg,jpeg,webp,gif,avif,svg}', { eager: true, import: 'default' }),
  ...import.meta.glob('../album/**/*.{png,jpg,jpeg,webp,gif,avif,svg}', { eager: true, import: 'default' }),
};

function getAlbumFolderNameFromPath(assetPath) {
  const normalizedPath = String(assetPath || '').replace(/\\/g, '/');
  const parts = normalizedPath.split('/').filter(Boolean);
  const rootIndex = parts.findIndex((part) => part === 'album' || part === 'albums');
  if (rootIndex === -1) return '';
  return String(parts[rootIndex + 1] || '').trim();
}

function buildStaticAlbumFolders() {
  const byFolder = new Map();

  ALBUM_FOLDERS_MANIFEST.forEach((entry) => {
    const folderName = String(entry?.name || '').trim();
    if (!folderName) return;

    const count = Number.isFinite(Number(entry?.count)) ? Number(entry.count) : 0;
    byFolder.set(folderName, {
      id: normalizeName(folderName).replace(/\s+/g, '-').toLowerCase(),
      name: folderName,
      count,
      coverUrl: '',
      images: [],
    });
  });

  Object.entries(ALBUM_IMAGE_MODULES).forEach(([assetPath, assetUrl]) => {
    const folderName = getAlbumFolderNameFromPath(assetPath);
    if (!folderName) return;

    const existing = byFolder.get(folderName) || {
      id: normalizeName(folderName).replace(/\s+/g, '-').toLowerCase(),
      name: folderName,
      count: 0,
      coverUrl: '',
      images: [],
    };

    const url = String(assetUrl || '').trim();
    if (!url) return;

    existing.images.push(url);
    if (!existing.coverUrl) existing.coverUrl = url;

    const hasManifestEntry = ALBUM_FOLDERS_MANIFEST.some(
      (entry) => String(entry?.name || '').trim() === folderName
    );
    if (!hasManifestEntry) existing.count += 1;

    byFolder.set(folderName, existing);
  });

  return Array.from(byFolder.values())
    .map((folder) => ({
      ...folder,
      images: folder.images.sort((a, b) => a.localeCompare(b, 'he')),
      coverUrl: folder.coverUrl || folder.images[0] || '',
      count: Number.isFinite(Number(folder.count)) ? Number(folder.count) : folder.images.length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

const STATIC_ALBUM_FOLDERS = buildStaticAlbumFolders();

function getEffectiveViewportWidth() {
  if (typeof window === 'undefined') return Number.POSITIVE_INFINITY;

  const layoutWidth = Number(window.innerWidth) || Number.POSITIVE_INFINITY;
  const visualWidth = Number(window.visualViewport?.width) || Number.POSITIVE_INFINITY;

  return Math.min(layoutWidth, visualWidth);
}

function detectMobileViewport() {
  if (typeof window === 'undefined') return false;

  const byMatchMedia = window.matchMedia?.(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`)?.matches;
  if (byMatchMedia) return true;

  return getEffectiveViewportWidth() <= MOBILE_BREAKPOINT_PX;
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

function parseStoredMembers(rawValue) {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.members)) return null;
    const members = parsed.members
      .filter((item) => item && typeof item === 'object' && item.id && item.name)
      .map((item) => ({ ...item }));
    return {
      sourceVersion: parsed.sourceVersion || null,
      members,
    };
  } catch {
    return null;
  }
}

function toShortDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getAge(birthDate) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  const dayDiff = now.getDate() - birth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) years -= 1;
  return years >= 0 ? years : null;
}

function birthOrderValue(member) {
  if (!member) return Number.POSITIVE_INFINITY;

  if (member.birth_date) {
    const parsed = new Date(member.birth_date).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }

  const birthYear = Number(member.birth_year);
  if (Number.isFinite(birthYear)) return birthYear * 10000;

  return Number.POSITIVE_INFINITY;
}

function getNextAnnualDate(dateString) {
  if (!dateString) return null;
  const original = new Date(dateString);
  if (Number.isNaN(original.getTime())) return null;

  const now = new Date();
  const next = new Date(now.getFullYear(), original.getMonth(), original.getDate());
  next.setHours(0, 0, 0, 0);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (next < today) next.setFullYear(now.getFullYear() + 1);

  return next;
}

function getCurrentMonthAnnualDate(dateString) {
  if (!dateString) return null;
  const original = new Date(dateString);
  if (Number.isNaN(original.getTime())) return null;

  const now = new Date();
  const thisYearDate = new Date(now.getFullYear(), original.getMonth(), original.getDate());
  thisYearDate.setHours(0, 0, 0, 0);
  if (thisYearDate.getMonth() !== now.getMonth()) return null;
  return thisYearDate;
}

function diffDays(date) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getBirthdayAge(member, eventDate) {
  if (!member || !eventDate) return null;

  const birthYear = Number(member.birth_year);
  if (Number.isFinite(birthYear)) {
    return eventDate.getFullYear() - birthYear;
  }

  if (!member.birth_date) return null;
  const birth = new Date(member.birth_date);
  if (Number.isNaN(birth.getTime())) return null;

  let years = eventDate.getFullYear() - birth.getFullYear();
  const monthDiff = eventDate.getMonth() - birth.getMonth();
  const dayDiff = eventDate.getDate() - birth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) years -= 1;
  return years >= 0 ? years : null;
}

function getUpcomingEvents(members) {
  const events = [];
  const anniversaryKeys = new Set();

  members
    .filter((member) => member.generation !== -1 && !member.date_of_death)
    .forEach((member) => {
      const birthEventDate = getCurrentMonthAnnualDate(member.birth_date);
      const birthInDays = diffDays(birthEventDate);
      if (birthInDays !== null) {
        events.push({
          id: `${member.id}_birthday`,
          type: 'birthday',
          name: formatDisplayName(member.name),
          date: birthEventDate,
          inDays: birthInDays,
          age: getBirthdayAge(member, birthEventDate),
        });
      }

      const weddingEventDate = getCurrentMonthAnnualDate(member.wedding_date);
      const weddingInDays = diffDays(weddingEventDate);
      if (weddingInDays !== null) {
        const spouseLabel = member.spouse_name ? formatDisplayName(member.spouse_name) : '';
        const weddingKey = member.spouse_id
          ? [member.id, member.spouse_id].sort().join('|')
          : [formatDisplayName(member.name), spouseLabel].sort().join('|');
        if (anniversaryKeys.has(weddingKey)) return;
        anniversaryKeys.add(weddingKey);

        events.push({
          id: `${member.id}_anniversary`,
          type: 'anniversary',
          name: `${formatDisplayName(member.name)}${spouseLabel ? ` ו${spouseLabel}` : ''}`,
          date: weddingEventDate,
          inDays: weddingInDays,
        });
      }
    });

  return events.sort((a, b) => a.date - b.date);
}

function formatMobileUpdateName(eventItem) {
  if (!eventItem) return '';
  if (eventItem.type === 'birthday' && Number.isFinite(Number(eventItem.age))) {
    return `${eventItem.name} (${Number(eventItem.age)})`;
  }
  return eventItem.name;
}

function rowSubtitle(member) {
  const relationBits = [];
  if (member.generation !== null && member.generation !== undefined) relationBits.push(`דור ${member.generation}`);
  if (member.city) relationBits.push(member.city);
  if (member.father_name) relationBits.push(`בן: ${formatDisplayName(member.father_name)}`);
  if (member.mother_name) relationBits.push(`בת: ${formatDisplayName(member.mother_name)}`);
  return relationBits.join(' • ') || 'ללא פרטים נוספים';
}

function mobileParentsSubtitle(member) {
  const father = formatDisplayName(member.father_name);
  const mother = formatDisplayName(member.mother_name);
  const gender = String(member.gender || '').trim().toLowerCase();
  const isFemale = ['נקבה', 'female', 'f', 'woman', 'אשה', 'אישה'].includes(gender);
  const relationWord = isFemale ? 'בת' : 'בן';

  if (father && mother) return `${relationWord} ${father} ו${mother}`;
  if (father) return `${relationWord} ${father}`;
  if (mother) return `${relationWord} ${mother}`;
  return 'ללא פרטי הורים';
}

function formatInDaysLabel(inDays) {
  if (inDays === 0) return 'היום';
  if (inDays > 0) return `בעוד ${inDays} ימים`;
  return `לפני ${Math.abs(inDays)} ימים`;
}

function initials(name) {
  const words = String(formatDisplayName(name) || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '👤';
  return words.slice(0, 2).map((part) => part[0]).join('');
}

function normalizePhoneForContact(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const cleaned = raw.replace(/[^\d+]/g, '');
  if (!cleaned) return '';

  if (cleaned.startsWith('+')) {
    return '+' + cleaned.slice(1).replace(/\+/g, '');
  }
  return cleaned.replace(/\+/g, '');
}

function toInternationalWhatsAppPhone(phoneValue) {
  const normalized = normalizePhoneForContact(phoneValue);
  if (!normalized) return '';

  const digitsOnly = normalized.replace(/^\+/, '');
  if (!digitsOnly) return '';
  if (digitsOnly.startsWith('972')) return digitsOnly;
  if (digitsOnly.startsWith('0')) return '972' + digitsOnly.slice(1);

  return digitsOnly;
}

function buildMemberContactLinks(phoneValue) {
  const telNumber = normalizePhoneForContact(phoneValue);
  const whatsappNumber = toInternationalWhatsAppPhone(phoneValue);

  return {
    hasPhone: Boolean(telNumber),
    telHref: telNumber ? 'tel:' + telNumber : '',
    whatsappHref: whatsappNumber ? 'https://wa.me/' + whatsappNumber : '',
  };
}

function memberMatchesSearch(member, query) {
  const needle = normalizeName(query).toLowerCase();
  if (!needle) return false;

  return [
    member?.name,
    formatDisplayName(member?.name),
    member?.city,
    member?.spouse_name,
    member?.father_name,
    member?.mother_name,
  ]
    .filter(Boolean)
    .some((value) => normalizeName(value).toLowerCase().includes(needle));
}

export default function AppTestDesktop() {
  const [members, setMembers] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [selectedAlbumFolderId, setSelectedAlbumFolderId] = useState('');
  const [mobileMemberDrawerOpen, setMobileMemberDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [mobileGenerationFilter, setMobileGenerationFilter] = useState('all');
  const [mobileTreeDiagramMode, setMobileTreeDiagramMode] = useState('classic');
  const [activeMenuTab, setActiveMenuTab] = useState(() => (detectMobileViewport() ? 'home' : 'map'));
  const [isMobileViewport, setIsMobileViewport] = useState(() => detectMobileViewport());

  useEffect(() => {
    const storedPayload = parseStoredMembers(window.localStorage.getItem(LOCAL_MEMBERS_STORAGE_KEY));
    if (
      storedPayload &&
      storedPayload.sourceVersion === LOCAL_MEMBERS_SOURCE_VERSION &&
      storedPayload.members.length > 0
    ) {
      setMembers(applyMemberImageFallbacks(storedPayload.members));
      return;
    }
    setMembers(applyMemberImageFallbacks(RESOLVED_FAMILY_MEMBERS_SEED.map((member) => ({ ...member }))));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const updateViewport = () => {
      setIsMobileViewport(detectMobileViewport());
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
    };
  }, []);

  useEffect(() => {
    if (!isMobileViewport) return;
    if (activeMenuTab === 'home' || activeMenuTab === 'people' || activeMenuTab === 'updates' || activeMenuTab === 'album' || activeMenuTab === 'tree') return;
    setActiveMenuTab('home');
  }, [activeMenuTab, isMobileViewport]);

  useEffect(() => {
    if (activeMenuTab !== 'album') {
      setSelectedAlbumFolderId('');
    }
    if (activeMenuTab !== 'people') {
      setMobileMemberDrawerOpen(false);
    }
  }, [activeMenuTab]);

  useEffect(() => {
    if (!isMobileViewport) {
      setMobileMemberDrawerOpen(false);
    }
  }, [isMobileViewport]);

  const treeMembers = useMemo(() => {
    return members
      .filter((member) => member.generation !== -1)
      .sort((a, b) => {
        const genA = Number.isFinite(Number(a.generation)) ? Number(a.generation) : 99;
        const genB = Number.isFinite(Number(b.generation)) ? Number(b.generation) : 99;
        if (genA !== genB) return genA - genB;
        return String(a.name || '').localeCompare(String(b.name || ''), 'he');
      });
  }, [members]);

  const membersById = useMemo(() => {
    return Object.fromEntries(treeMembers.map((member) => [member.id, member]));
  }, [treeMembers]);

  useEffect(() => {
    if (!isMobileViewport || activeMenuTab !== 'tree') return;
    const query = searchTerm.trim();
    if (!query) return;

    const matchedMember = treeMembers.find((member) => memberMatchesSearch(member, query));
    if (matchedMember && matchedMember.id !== selectedMemberId) {
      setSelectedMemberId(matchedMember.id);
    }
  }, [activeMenuTab, isMobileViewport, searchTerm, selectedMemberId, treeMembers]);

  const filteredMembers = useMemo(() => {
    const uniqueMembers = [];
    const seenNames = new Set();
    treeMembers.forEach((member) => {
      const normalizedKey = normalizeName(formatDisplayName(member.name)).toLowerCase();
      const key = normalizedKey || `id:${member.id}`;
      if (seenNames.has(key)) return;
      seenNames.add(key);
      uniqueMembers.push(member);
    });

    const generationFilteredMembers = isMobileViewport
      ? uniqueMembers.filter((member) => {
          if (mobileGenerationFilter === 'all') return true;
          const generation = Number(member.generation);
          return generation === Number(mobileGenerationFilter);
        })
      : uniqueMembers;

    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return generationFilteredMembers;
    return generationFilteredMembers.filter((member) => {
      return [member.name, member.city, member.spouse_name, member.father_name, member.mother_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [isMobileViewport, mobileGenerationFilter, searchTerm, treeMembers]);

  useEffect(() => {
    if (!selectedMemberId && treeMembers.length > 0) {
      setSelectedMemberId(treeMembers[0].id);
      return;
    }
    if (selectedMemberId && !treeMembers.some((member) => member.id === selectedMemberId)) {
      setSelectedMemberId(treeMembers[0]?.id || '');
    }
  }, [selectedMemberId, treeMembers]);

  const selectedMember = useMemo(() => {
    return treeMembers.find((member) => member.id === selectedMemberId) || null;
  }, [treeMembers, selectedMemberId]);
  const selectedMemberImageUrl = resolveMemberImageUrl(selectedMember?.image_url);
  const selectedMemberSpouseName = useMemo(() => {
    if (!selectedMember) return '-';
    if (selectedMember.spouse_id) {
      return formatDisplayName(membersById[selectedMember.spouse_id]?.name || selectedMember.spouse_name) || '-';
    }
    return formatDisplayName(selectedMember.spouse_name) || '-';
  }, [membersById, selectedMember]);
  const selectedMemberContact = useMemo(
    () => buildMemberContactLinks(selectedMember?.phone_number),
    [selectedMember?.phone_number]
  );

  const selectedChildren = useMemo(() => {
    if (!selectedMember) return [];

    const selectedDisplayName = normalizeName(formatDisplayName(selectedMember.name)).toLowerCase();
    const selectedAliases = treeMembers.filter(
      (member) => normalizeName(formatDisplayName(member.name)).toLowerCase() === selectedDisplayName
    );

    const selectedAliasIds = new Set(selectedAliases.map((member) => member.id));
    const selectedAliasRawNames = new Set(selectedAliases.map((member) => normalizeName(member.name)));
    const selectedAliasDisplayNames = new Set(
      selectedAliases.map((member) => normalizeName(formatDisplayName(member.name)).toLowerCase())
    );

    const relatedChildren = treeMembers
      .filter((member) => {
        if (selectedAliasIds.has(member.id)) return false;

        if (selectedAliasIds.has(member.father_id) || selectedAliasIds.has(member.mother_id)) return true;

        const fatherRaw = normalizeName(member.father_name);
        const motherRaw = normalizeName(member.mother_name);
        const fatherDisplay = normalizeName(formatDisplayName(member.father_name)).toLowerCase();
        const motherDisplay = normalizeName(formatDisplayName(member.mother_name)).toLowerCase();

        return (
          selectedAliasRawNames.has(fatherRaw) ||
          selectedAliasRawNames.has(motherRaw) ||
          selectedAliasDisplayNames.has(fatherDisplay) ||
          selectedAliasDisplayNames.has(motherDisplay)
        );
      })
      .sort((a, b) => {
        const birthDiff = birthOrderValue(a) - birthOrderValue(b);
        if (Number.isFinite(birthDiff) && birthDiff !== 0) return birthDiff;
        return String(formatDisplayName(a.name) || '').localeCompare(String(formatDisplayName(b.name) || ''), 'he');
      });

    const seenChildNames = new Set();
    return relatedChildren.filter((child) => {
      const normalizedChildName = normalizeName(formatDisplayName(child.name)).toLowerCase();
      const key = normalizedChildName || `id:${child.id}`;
      if (seenChildNames.has(key)) return false;
      seenChildNames.add(key);
      return true;
    });
  }, [selectedMember, treeMembers]);

  const upcomingEvents = useMemo(() => getUpcomingEvents(treeMembers), [treeMembers]);
  const birthdayEvents = useMemo(
    () => upcomingEvents.filter((eventItem) => eventItem.type === 'birthday'),
    [upcomingEvents]
  );
  const anniversaryEvents = useMemo(
    () => upcomingEvents.filter((eventItem) => eventItem.type === 'anniversary'),
    [upcomingEvents]
  );
  const homeEvents = useMemo(() => upcomingEvents.slice(0, 6), [upcomingEvents]);
  const albumFolders = STATIC_ALBUM_FOLDERS;
  const selectedAlbumFolder = useMemo(() => {
    if (!selectedAlbumFolderId) return null;
    return (
      albumFolders.find((folder) => folder.id === selectedAlbumFolderId || folder.name === selectedAlbumFolderId) ||
      null
    );
  }, [albumFolders, selectedAlbumFolderId]);
  const showingMap = activeMenuTab === 'map';
  const menuItems = [
    { id: 'tree', label: 'עץ משפחה', icon: GitBranch },
    { id: 'people', label: 'אנשים', icon: Users },
    { id: 'updates', label: 'עדכונים', icon: Bell },
    { id: 'map', label: 'מפה', icon: MapPinned },
    { id: 'settings', label: 'הגדרות', icon: UserRound },
  ];
  const mobileMenuItems = [
    { id: 'home', label: 'בית', icon: House },
    { id: 'updates', label: 'עדכונים', icon: Bell },
    { id: 'people', label: 'חברי המשפחה', icon: Users },
    { id: 'album', label: 'אלבום תמונות', icon: Images },
  ];
  const mobileGenerationFilters = [
    { id: 'all', label: 'כולם' },
    { id: '1', label: 'דור 1' },
    { id: '2', label: 'דור 2' },
    { id: '3', label: 'דור 3' },
  ];
  const mobileTreeViewFilters = [
    { id: 'classic', label: 'אנכי' },
    { id: 'canvasVertical', label: 'אופקי' },
  ];

  const mobileHeaderTitle = useMemo(() => {
    if (activeMenuTab === 'home') return 'בית';
    if (activeMenuTab === 'people') return 'חברי המשפחה';
    if (activeMenuTab === 'updates') return 'עדכונים';
    if (activeMenuTab === 'album') return 'אלבום תמונות';
    if (activeMenuTab === 'tree') return 'עץ משפחה';
    return 'משפחת כהן';
  }, [activeMenuTab]);

  const renderListAvatar = (member) => {
    const imageUrl = resolveMemberImageUrl(member?.image_url);
    if (imageUrl) {
      return (
        <img
          className="test-mobile-avatar-image"
          src={imageUrl}
          alt={formatDisplayName(member.name)}
          loading="lazy"
        />
      );
    }
    return <span className="test-mobile-avatar-fallback">{initials(member.name)}</span>;
  };

  if (isMobileViewport) {
    const showHomeScreen = activeMenuTab === 'home';
    const showPeopleScreen = activeMenuTab === 'people';
    const showUpdatesScreen = activeMenuTab === 'updates';
    const showAlbumScreen = activeMenuTab === 'album';
    const showTreeScreen = activeMenuTab === 'tree';

    const openMobileMemberDrawer = (memberId) => {
      setSelectedMemberId(memberId);
      setMobileMemberDrawerOpen(true);
    };

    const renderMobileMemberDrawer = () => {
      if (!mobileMemberDrawerOpen || !selectedMember) return null;

      return (
                <div
                  className="test-mobile-member-overlay"
                  role="button"
                  tabIndex={0}
                  aria-label="סגירת כרטיס בן משפחה"
                  onClick={() => setMobileMemberDrawerOpen(false)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setMobileMemberDrawerOpen(false);
                    }
                  }}
                >
                  <aside
                    className="test-mobile-member-drawer"
                    role="dialog"
                    aria-modal="true"
                    aria-label="כרטיס בן משפחה"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="test-mobile-member-drawer-head">
                      <button
                        type="button"
                        className="test-mobile-member-drawer-close"
                        aria-label="סגירת כרטיס בן משפחה"
                        onClick={() => setMobileMemberDrawerOpen(false)}
                      >
                        <X size={22} strokeWidth={2.25} />
                      </button>
                    </div>

                    <div className="test-mobile-member-drawer-profile">
                      <span className="test-mobile-member-drawer-avatar">
                        {selectedMemberImageUrl ? (
                          <img
                            className="test-mobile-member-drawer-avatar-image"
                            src={selectedMemberImageUrl}
                            alt={formatDisplayName(selectedMember.name)}
                            loading="lazy"
                          />
                        ) : (
                          <span className="test-mobile-member-drawer-avatar-fallback">{initials(selectedMember.name)}</span>
                        )}
                      </span>

                      <div className="test-mobile-member-drawer-title">
                        <h2>{formatDisplayName(selectedMember.name)}</h2>
                        <p>{selectedMember.gender || 'ללא מין'} • דור {selectedMember.generation ?? '-'}</p>
                      </div>
                    </div>

                    <div className="test-mobile-member-drawer-details">
                      <div className="test-mobile-member-drawer-row">
                        <span>גיל:</span>
                        <strong>{getAge(selectedMember.birth_date) ?? '-'}</strong>
                      </div>
                      <div className="test-mobile-member-drawer-row">
                        <span>תאריך לידה:</span>
                        <strong>{toShortDate(selectedMember.birth_date)}</strong>
                      </div>
                      <div className="test-mobile-member-drawer-row">
                        <span>טלפון:</span>
                        <strong>{selectedMember.phone_number || '-'}</strong>
                      </div>
                      <div className="test-mobile-member-contact-actions" aria-label="יצירת קשר מהירה">
                        <a
                          href={selectedMemberContact.telHref || '#'}
                          className={selectedMemberContact.telHref ? 'test-mobile-member-contact-btn' : 'test-mobile-member-contact-btn disabled'}
                          aria-label="התקשרות טלפונית"
                          onClick={(event) => {
                            if (!selectedMemberContact.telHref) event.preventDefault();
                          }}
                        >
                          <Phone size={18} strokeWidth={2.2} />
                          <span>טלפון</span>
                        </a>
                        <a
                          href={selectedMemberContact.whatsappHref || '#'}
                          className={selectedMemberContact.whatsappHref ? 'test-mobile-member-contact-btn whatsapp' : 'test-mobile-member-contact-btn whatsapp disabled'}
                          aria-label="פתיחה ב-WhatsApp"
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => {
                            if (!selectedMemberContact.whatsappHref) event.preventDefault();
                          }}
                        >
                          <MessageCircle size={18} strokeWidth={2.2} />
                          <span>WhatsApp</span>
                        </a>
                      </div>
                      <div className="test-mobile-member-drawer-row">
                        <span>אימייל:</span>
                        <strong>{selectedMember.email || '-'}</strong>
                      </div>
                      <div className="test-mobile-member-drawer-row">
                        <span>עיר:</span>
                        <strong>{selectedMember.city || '-'}</strong>
                      </div>
                      <div className="test-mobile-member-drawer-row">
                        <span>בן/בת זוג:</span>
                        <strong>{selectedMemberSpouseName}</strong>
                      </div>
                      <div className="test-mobile-member-drawer-row">
                        <span>ילדים:</span>
                        <strong>{selectedChildren.map((child) => formatDisplayName(child.name)).join(', ') || '-'}</strong>
                      </div>
                    </div>
                  </aside>
                </div>
      );
    };

    return (
      <div className="test-page test-mobile-page" dir="rtl">
        <header className={showHomeScreen ? 'test-mobile-header test-mobile-header-home' : 'test-mobile-header'}>
          {showHomeScreen ? (
            <div className="test-mobile-home-brand">
              <span className="test-mobile-home-logo" aria-hidden="true">
                <GitBranch size={24} strokeWidth={2.2} />
              </span>
              <div className="test-mobile-home-brand-text">
                <h1>משפחת כהן</h1>
                <p>עץ המשפחה שלנו</p>
              </div>
            </div>
          ) : (
            <>
              <h1>{mobileHeaderTitle}</h1>
              {showAlbumScreen && selectedAlbumFolder ? (
                <button
                  type="button"
                  className="test-mobile-header-icon"
                  aria-label="חזרה לתיקיות האלבום"
                  onClick={() => setSelectedAlbumFolderId('')}
                >
                  <ArrowRight size={24} strokeWidth={2.1} />
                </button>
              ) : null}
            </>
          )}
        </header>

        <main className={showHomeScreen ? 'test-mobile-main test-mobile-main-home' : 'test-mobile-main'}>
          {showHomeScreen && (
            <section className="test-mobile-screen test-mobile-home-screen">
              <div className="test-mobile-search-wrap test-mobile-home-search">
                <span className="test-mobile-search-icon">
                  <Search size={21} strokeWidth={2} />
                </span>
                <input
                  type="search"
                  className="test-mobile-search-input"
                  placeholder="חיפוש בן משפחה..."
                  value={searchTerm}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setSearchTerm(nextValue);
                    if (nextValue.trim()) setActiveMenuTab('people');
                  }}
                />
              </div>

              <article className="test-mobile-home-updates">
                <div className="test-mobile-home-updates-head">
                  <strong>עדכונים</strong>
                  <button type="button" onClick={() => setActiveMenuTab('updates')}>
                    לכל העדכונים
                  </button>
                </div>
                {homeEvents.length === 0 ? (
                  <p className="test-update-empty">אין עדכונים בחודש הנוכחי.</p>
                ) : (
                  <div className="test-mobile-home-updates-list">
                    {homeEvents.map((eventItem) => (
                      <button
                        key={eventItem.id}
                        type="button"
                        className="test-mobile-home-update-row"
                        onClick={() => setActiveMenuTab('updates')}
                      >
                        <span className="test-mobile-home-update-type">
                          {eventItem.type === 'birthday' ? 'יום הולדת' : 'יום נישואין'}
                        </span>
                        <span className="test-mobile-home-update-name">{formatMobileUpdateName(eventItem)}</span>
                        <small className="test-mobile-home-update-meta">
                          {toShortDate(eventItem.date)} • {formatInDaysLabel(eventItem.inDays)}
                        </small>
                      </button>
                    ))}
                  </div>
                )}
              </article>
            </section>
          )}

          {showPeopleScreen && (
            <section className="test-mobile-screen test-mobile-people-screen">
              <div className="test-mobile-people-stickybar">
                <div className="test-mobile-search-wrap">
                  <span className="test-mobile-search-icon">
                    <Search size={21} strokeWidth={2} />
                  </span>
                  <input
                    type="search"
                    className="test-mobile-search-input"
                    placeholder="חיפוש..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>

                <div className="test-mobile-people-controls" aria-label="סינון בני משפחה">
                  <button
                    type="button"
                    className="test-mobile-tree-toggle"
                    aria-label="מעבר למרשם משפחתי"
                    onClick={() => setActiveMenuTab('tree')}
                  >
                    <img className="test-mobile-tree-toggle-icon" src={treeIconUrl} alt="" aria-hidden="true" />
                  </button>
                  <div className="test-mobile-generation-filters">
                    {mobileGenerationFilters.map((filterItem) => (
                      <button
                        key={filterItem.id}
                        type="button"
                        className={
                          mobileGenerationFilter === filterItem.id
                            ? 'test-mobile-generation-filter active'
                            : 'test-mobile-generation-filter'
                        }
                        onClick={() => setMobileGenerationFilter(filterItem.id)}
                      >
                        {filterItem.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="test-mobile-member-list">
                {filteredMembers.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className={selectedMemberId === member.id ? 'test-mobile-member-row active' : 'test-mobile-member-row'}
                    onClick={() => openMobileMemberDrawer(member.id)}
                  >
                    <span className="test-mobile-avatar">{renderListAvatar(member)}</span>
                    <span className="test-mobile-member-meta">
                      <strong>{formatDisplayName(member.name)}</strong>
                      <small>{mobileParentsSubtitle(member)}</small>
                    </span>
                  </button>
                ))}
              </div>

              {renderMobileMemberDrawer()}
            </section>
          )}

          {showTreeScreen && (
            <section className="test-mobile-screen test-mobile-tree-screen">
              <div className="test-mobile-tree-stickybar">
                <div className="test-mobile-search-wrap test-mobile-tree-search">
                  <span className="test-mobile-search-icon">
                    <Search size={21} strokeWidth={2} />
                  </span>
                  <input
                    type="search"
                    className="test-mobile-search-input"
                    placeholder="חיפוש..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>

                <div className="test-mobile-tree-controls" aria-label="בחירת תצוגת עץ">
                  <button
                    type="button"
                    className="test-mobile-tree-toggle"
                    aria-label="חזרה לרשימת בני המשפחה"
                    onClick={() => setActiveMenuTab('people')}
                  >
                    <img className="test-mobile-tree-toggle-icon" src={listIconUrl} alt="" aria-hidden="true" />
                  </button>
                  <div className="test-mobile-tree-view-filters">
                    {mobileTreeViewFilters.map((filterItem) => (
                      <button
                        key={filterItem.id}
                        type="button"
                        className={
                          mobileTreeDiagramMode === filterItem.id
                            ? 'test-mobile-tree-view-filter active'
                            : 'test-mobile-tree-view-filter'
                        }
                        onClick={() => setMobileTreeDiagramMode(filterItem.id)}
                      >
                        {filterItem.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <FamilySchematicDiagram
                members={treeMembers}
                selectedMemberId={selectedMemberId}
                onSelectMember={openMobileMemberDrawer}
                mobileCompact
                showViewSwitch={false}
                diagramMode={mobileTreeDiagramMode}
                onDiagramModeChange={setMobileTreeDiagramMode}
              />
              {renderMobileMemberDrawer()}
            </section>
          )}

          {showUpdatesScreen && (
            <section className="test-mobile-screen test-mobile-updates-screen">
              <div className="test-mobile-updates-list">
                <article className="test-update-item">
                  <strong>ימי הולדת</strong>
                  {birthdayEvents.length === 0 ? (
                    <p className="test-update-empty">אין ימי הולדת בחודש הנוכחי.</p>
                  ) : (
                    <div className="test-update-group-list">
                      {birthdayEvents.map((eventItem) => (
                        <div key={eventItem.id} className="test-update-row">
                          <span className="test-update-name">{formatMobileUpdateName(eventItem)}</span>
                          <small className="test-update-date">{toShortDate(eventItem.date)}</small>
                          <small className="test-update-days">{formatInDaysLabel(eventItem.inDays)}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="test-update-item">
                  <strong>ימי נישואין</strong>
                  {anniversaryEvents.length === 0 ? (
                    <p className="test-update-empty">אין ימי נישואין בחודש הנוכחי.</p>
                  ) : (
                    <div className="test-update-group-list">
                      {anniversaryEvents.map((eventItem) => (
                        <div key={eventItem.id} className="test-update-row">
                          <span className="test-update-name">{formatMobileUpdateName(eventItem)}</span>
                          <small className="test-update-date">{toShortDate(eventItem.date)}</small>
                          <small className="test-update-days">{formatInDaysLabel(eventItem.inDays)}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </div>
            </section>
          )}

          {showAlbumScreen && (
            <section className="test-mobile-screen test-mobile-album-screen">
              {albumFolders.length === 0 ? (
                <p className="test-empty">לא נמצאו תיקיות אלבום עם תמונות.</p>
              ) : selectedAlbumFolder ? (
                <div className="test-mobile-album-detail">
                  <div className="test-mobile-album-detail-head">
                    <strong className="test-mobile-album-detail-title">{selectedAlbumFolder.name}</strong>
                    <small className="test-mobile-album-detail-count">
                      {selectedAlbumFolder.images.length || selectedAlbumFolder.count} תמונות
                    </small>
                  </div>

                  {selectedAlbumFolder.images.length === 0 ? (
                    <p className="test-empty">אין תמונות בתיקייה זו.</p>
                  ) : (
                    <div className="test-mobile-album-gallery">
                      {selectedAlbumFolder.images.map((imageUrl, imageIndex) => (
                        <figure
                          key={`${selectedAlbumFolder.id || selectedAlbumFolder.name}-${imageIndex + 1}`}
                          className="test-mobile-album-gallery-item"
                        >
                          <img
                            className="test-mobile-album-gallery-photo"
                            src={imageUrl}
                            alt={`${selectedAlbumFolder.name} ${imageIndex + 1}`}
                            loading="lazy"
                          />
                        </figure>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="test-mobile-album-grid">
                  {albumFolders.map((folder) => (
                    <button
                      key={folder.id || folder.name}
                      type="button"
                      className="test-mobile-album-item"
                      onClick={() => setSelectedAlbumFolderId(folder.id || folder.name)}
                    >
                      <span className="test-mobile-album-photo-frame">
                        {folder.coverUrl ? (
                          <img
                            className="test-mobile-album-photo"
                            src={folder.coverUrl}
                            alt={folder.name}
                            loading="lazy"
                          />
                        ) : (
                          <span className="test-mobile-album-fallback test-mobile-album-folder-icon">
                            <Folder size={24} strokeWidth={2.1} />
                          </span>
                        )}
                      </span>
                      <span className="test-mobile-album-name">{folder.name}</span>
                      <small className="test-mobile-album-count">{folder.count} תמונות</small>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>

        <nav className="test-mobile-bottom-nav" aria-label="תפריט מובייל">
          {mobileMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeMenuTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={isActive ? 'test-mobile-nav-btn active' : 'test-mobile-nav-btn'}
                onClick={() => setActiveMenuTab(item.id)}
              >
                <Icon size={20} strokeWidth={2.1} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="test-page" dir="rtl">
      <header className="test-topbar">
        <div className="test-topbar-brand">
          <h1>משפחת כהן</h1>
          <p>index-test | תצוגת דסקטופ מותאמת</p>
        </div>

        <div className="test-topbar-main">
          <nav className="test-topbar-menu" aria-label="תפריט ראשי">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={activeMenuTab === item.id ? 'test-menu-btn active' : 'test-menu-btn'}
                  onClick={() => setActiveMenuTab(item.id)}
                >
                  <span className="test-menu-btn-icon" aria-hidden="true">
                    <Icon size={18} strokeWidth={2.1} />
                  </span>
                  <span className="test-menu-btn-label">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <label className="test-topbar-search">
            <input
              type="search"
              placeholder="חיפוש שם, קשר, עיר..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
        </div>
      </header>

      <div className="test-desktop-scroll">
        <section className="test-desktop-grid">
          <section className="test-people-stack-col">
            <section className="test-panel test-members-col">
              <div className="test-panel-head">
                <h3>בני המשפחה ({filteredMembers.length})</h3>
              </div>
              <div className="test-member-list">
                {filteredMembers.map((member) => (
                  <button
                    key={member.id}
                    className={selectedMemberId === member.id ? 'test-member-row active' : 'test-member-row'}
                    onClick={() => setSelectedMemberId(member.id)}
                  >
                    <span className="test-avatar">{initials(member.name)}</span>
                    <span className="test-member-meta">
                      <strong>{formatDisplayName(member.name)}</strong>
                      <small>{mobileParentsSubtitle(member)}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="test-panel test-selected-col">
              <div className="test-panel-head">
                <h3>כרטיס בן משפחה</h3>
              </div>
              {selectedMember ? (
                <div className="test-member-card">
                  <div className="test-member-card-header">
                    <div className="test-member-card-title">
                      <h2>{formatDisplayName(selectedMember.name)}</h2>
                      <p>{selectedMember.gender || 'ללא מין'} • דור {selectedMember.generation ?? '-'}</p>
                    </div>
                    <span className="test-member-photo-frame">
                      {selectedMemberImageUrl ? (
                        <img
                          className="test-member-photo"
                          src={selectedMemberImageUrl}
                          alt={formatDisplayName(selectedMember.name)}
                          loading="lazy"
                        />
                      ) : (
                        <span className="test-member-photo-placeholder">{initials(selectedMember.name)}</span>
                      )}
                    </span>
                  </div>
                  <ul>
                    <li>גיל: {getAge(selectedMember.birth_date) ?? '-'}</li>
                    <li>תאריך לידה: {toShortDate(selectedMember.birth_date)}</li>
                    <li>טלפון: {selectedMember.phone_number || '-'}</li>
                    <li className="test-member-card-contact-line">
                      <span>יצירת קשר:</span>
                      <span className="test-member-card-contact-actions">
                        <a
                          href={selectedMemberContact.telHref || '#'}
                          className={selectedMemberContact.telHref ? 'test-member-card-contact-btn' : 'test-member-card-contact-btn disabled'}
                          aria-label="התקשרות טלפונית"
                          onClick={(event) => {
                            if (!selectedMemberContact.telHref) event.preventDefault();
                          }}
                        >
                          <Phone size={14} strokeWidth={2.2} />
                        </a>
                        <a
                          href={selectedMemberContact.whatsappHref || '#'}
                          className={selectedMemberContact.whatsappHref ? 'test-member-card-contact-btn whatsapp' : 'test-member-card-contact-btn whatsapp disabled'}
                          aria-label="פתיחה ב-WhatsApp"
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => {
                            if (!selectedMemberContact.whatsappHref) event.preventDefault();
                          }}
                        >
                          <MessageCircle size={14} strokeWidth={2.2} />
                        </a>
                      </span>
                    </li>
                    <li>אימייל: {selectedMember.email || '-'}</li>
                    <li>עיר: {selectedMember.city || '-'}</li>
                    <li>
                      בן/בת זוג:{' '}
                      {selectedMember.spouse_id
                        ? formatDisplayName(membersById[selectedMember.spouse_id]?.name || selectedMember.spouse_name) || '-'
                        : formatDisplayName(selectedMember.spouse_name) || '-'}
                    </li>
                    <li>ילדים: {selectedChildren.map((child) => formatDisplayName(child.name)).join(', ') || '-'}</li>
                  </ul>
                </div>
              ) : (
                <p className="test-empty">בחר בן משפחה מהרשימה.</p>
              )}
            </section>
          </section>

          <section className="test-panel test-schematic-col">
            <div className="test-panel-head">
              <h3>{showingMap ? 'מפת Shortbread (חינמי)' : 'תרשים סכמתי'}</h3>
            </div>
            {showingMap ? (
              <FamilyWorldMap
                members={treeMembers}
                selectedMemberId={selectedMemberId}
                onSelectMember={setSelectedMemberId}
              />
            ) : (
              <FamilySchematicDiagram
                members={treeMembers}
                selectedMemberId={selectedMemberId}
                onSelectMember={setSelectedMemberId}
              />
            )}
          </section>

          <aside className="test-panel test-updates-col">
            <div className="test-panel-head">
              <h3>הודעות ועדכונים</h3>
            </div>
            <div className="test-updates-list">
              {upcomingEvents.length === 0 ? (
                <p className="test-empty">אין עדכונים קרובים.</p>
              ) : (
                <>
                  <article className="test-update-item">
                    <strong>ימי הולדת</strong>
                    {birthdayEvents.length === 0 ? (
                      <p className="test-update-empty">אין ימי הולדת קרובים.</p>
                    ) : (
                      <div className="test-update-group-list">
                        {birthdayEvents.map((eventItem) => (
                          <div key={eventItem.id} className="test-update-row">
                            <span className="test-update-name">{formatMobileUpdateName(eventItem)}</span>
                            <small className="test-update-date">{toShortDate(eventItem.date)}</small>
                            <small className="test-update-days">
                              {formatInDaysLabel(eventItem.inDays)}
                            </small>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>

                  <article className="test-update-item">
                    <strong>ימי נישואין</strong>
                    {anniversaryEvents.length === 0 ? (
                      <p className="test-update-empty">אין ימי נישואין קרובים.</p>
                    ) : (
                      <div className="test-update-group-list">
                        {anniversaryEvents.map((eventItem) => (
                          <div key={eventItem.id} className="test-update-row">
                            <span className="test-update-name">{formatMobileUpdateName(eventItem)}</span>
                            <small className="test-update-date">{toShortDate(eventItem.date)}</small>
                            <small className="test-update-days">
                              {formatInDaysLabel(eventItem.inDays)}
                            </small>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                </>
              )}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
