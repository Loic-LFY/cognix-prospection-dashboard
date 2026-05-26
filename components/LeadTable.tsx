'use client';

import { useEffect, useState, useCallback } from 'react';
import LeadRow from './LeadRow';
import type { Lead, LeadsResponse, LeadFilters, Temperature, LeadStatus, LinkedInStatus } from '@/types/lead';

const TEMPERATURES: { value: string; label: string }[] = [
  { value: '', label: 'Toutes températures' },
  { value: 'chaud', label: '🔥 Chaud' },
  { value: 'tiede', label: '🌤 Tiède' },
  { value: 'froid', label: '❄️ Froid' },
  { value: 'new', label: '• Nouveau' },
];

const STATUSES: { value: string; label: string }[] = [
  { value: '', label: 'Tous statuts' },
  { value: 'new', label: 'Nouveau' },
  { value: 'linkedin_pending', label: 'LinkedIn ⏳' },
  { value: 'connection_sent', label: 'Connexion envoyée' },
  { value: 'connected', label: 'Connecté' },
  { value: 'message_sent', label: 'Message envoyé' },
  { value: 'chaud', label: '🔥 Chaud' },
  { value: 'rdv_planifie', label: '📅 RDV planifié' },
  { value: 'converti', label: '✅ Converti' },
  { value: 'perdu', label: '❌ Perdu' },
  { value: 'ban', label: '🚫 Ban' },
];

const LINKEDIN_STATUSES: { value: string; label: string }[] = [
  { value: '', label: 'Tout LinkedIn' },
  { value: 'pending', label: 'En attente' },
  { value: 'not_found', label: 'Non trouvé' },
  { value: 'found', label: 'Trouvé' },
  { value: 'connection_sent', label: 'Connexion envoyée' },
  { value: 'connected', label: 'Connecté' },
  { value: 'message_sent', label: 'Message envoyé' },
  { value: 'replied', label: 'Répondu' },
];

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Date création' },
  { value: 'score', label: 'Score' },
  { value: 'last_action_date', label: 'Dernière action' },
];

export default function LeadTable() {
  const [data, setData] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [temperature, setTemperature] = useState('');
  const [status, setStatus] = useState('');
  const [linkedinStatus, setLinkedinStatus] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [pageSize] = useState(20);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortOrder,
    });
    if (temperature) params.set('temperature', temperature);
    if (status) params.set('status', status);
    if (linkedinStatus) params.set('linkedin_status', linkedinStatus);
    if (search) params.set('search', search);

    try {
      const res = await fetch(`/api/leads?${params.toString()}`);
      if (res.ok) {
        const json: LeadsResponse = await res.json();
        setData(json.data);
        setTotal(json.total);
        setTotalPages(json.totalPages);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, temperature, status, linkedinStatus, search]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [temperature, status, linkedinStatus, search, sortBy, sortOrder]);

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <span className="opacity-30">↕</span>;
    return <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
      {/* Filters bar */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
        />
        <select
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {TEMPERATURES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          value={linkedinStatus}
          onChange={(e) => setLinkedinStatus(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {LINKEDIN_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          {loading ? (
            <span className="animate-pulse">Chargement...</span>
          ) : (
            <span>{total} lead{total > 1 ? 's' : ''}</span>
          )}
          <button
            onClick={fetchLeads}
            className="p-1 hover:text-gray-700 dark:hover:text-gray-200 transition"
            title="Rafraîchir"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Société
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                onClick={() => toggleSort('score')}
              >
                Score <SortIcon col="score" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Localisation
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Contact
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Hébergeur
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Température
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                LinkedIn
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                onClick={() => toggleSort('last_action_date')}
              >
                Dernière action <SortIcon col="last_action_date" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Statut
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">
                  Aucun lead trouvé
                </td>
              </tr>
            )}
            {data.map((lead) => (
              <LeadRow key={lead.id} lead={lead} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            Page {page} / {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition"
            >
              ← Préc.
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition"
            >
              Suiv. →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
