'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Temperature, LeadStatus } from '@/types/lead';

interface Props {
  leadId: string;
  currentTemperature: Temperature;
  currentStatus: LeadStatus;
}

const TEMP_ACTIONS: { icon: string; label: string; temperature: Temperature; status?: LeadStatus; className: string }[] = [
  {
    icon: '🔥',
    label: 'Chaud',
    temperature: 'chaud',
    status: 'chaud',
    className: 'bg-orange-100 hover:bg-orange-200 text-orange-700 dark:bg-orange-900 dark:hover:bg-orange-800 dark:text-orange-300',
  },
  {
    icon: '❄️',
    label: 'Froid',
    temperature: 'froid',
    className: 'bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900 dark:hover:bg-blue-800 dark:text-blue-300',
  },
  {
    icon: '📅',
    label: 'RDV',
    temperature: 'chaud',
    status: 'rdv_planifie',
    className: 'bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900 dark:hover:bg-green-800 dark:text-green-300',
  },
];

export default function TemperatureActions({ leadId, currentTemperature, currentStatus }: Props) {
  const router = useRouter();
  const [temp, setTemp] = useState<Temperature>(currentTemperature);
  const [status, setStatus] = useState<LeadStatus>(currentStatus);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const show = temp === 'tiede' || status === 'message_sent';
  if (!show) return null;

  async function handleClick(temperature: Temperature, newStatus?: LeadStatus) {
    setBusy(true);
    try {
      const body: Record<string, string> = { temperature };
      if (newStatus) body.status = newStatus;
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setTemp(temperature);
        if (newStatus) setStatus(newStatus);
        setDone(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <p className="text-sm text-green-600 dark:text-green-400 font-medium">✅ Classification enregistrée</p>
      </div>
    );
  }

  return (
    <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400 mb-3">
        🌤 Ce lead a répondu - Classifiez-le
      </h3>
      <p className="text-xs text-orange-600 dark:text-orange-500 mb-4">
        Choisissez la suite du suivi en fonction de la réponse reçue.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {TEMP_ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => handleClick(action.temperature, action.status)}
            disabled={busy}
            title={action.label}
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-base transition disabled:opacity-40 ${action.className}`}
          >
            {busy ? '⏳' : action.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
