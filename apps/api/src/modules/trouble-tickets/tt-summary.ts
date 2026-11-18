import { formatInZone, type RemoteContact, type TimeZoneName } from '@tyio/shared';

export interface TroubleTicketSummaryInput {
  ttNumber: string;
  ticketNumber: string;
  customerTicketNumber: string | null;
  tenantName: string;
  remote: {
    siteId: string;
    name: string;
    address: string | null;
    city: string;
    province: string;
    timeZone: TimeZoneName;
    ipSnmp: string | null;
    ipLan: string | null;
    contacts: RemoteContact[];
  };
  jarkomName: string;
  problem: string;
  openedAt: Date;
  openedBy: string;
}

/**
 * Ringkasan TT siap tempel ke chat Service Delivery (K25): nomor, remote, lokasi, jaringan,
 * problem, dan kontak PIC lokasi. Baris yang datanya kosong dilewati; waktu menurut lokasi remote.
 */
export function troubleTicketSummary(i: TroubleTicketSummaryInput): string {
  const network = [i.jarkomName, i.remote.ipSnmp && `IP SNMP ${i.remote.ipSnmp}`, i.remote.ipLan && `IP LAN ${i.remote.ipLan}`]
    .filter(Boolean)
    .join(' · ');
  const contacts = i.remote.contacts
    .map((c) => [c.name, c.role && `(${c.role})`, c.phone].filter(Boolean).join(' '))
    .join('; ');
  return [
    `${i.ttNumber} (NPR ${i.ticketNumber})`,
    `Customer: ${i.tenantName}${i.customerTicketNumber ? ` · No. tiket customer ${i.customerTicketNumber}` : ''}`,
    `Remote: ${i.remote.name} (${i.remote.siteId})`,
    `Lokasi: ${[i.remote.address, i.remote.city, i.remote.province].filter(Boolean).join(', ')}`,
    `Jarkom: ${network}`,
    `Problem: ${i.problem}`,
    `Kontak: ${contacts || '-'}`,
    `Dibuka: ${formatInZone(i.openedAt, i.remote.timeZone)} oleh ${i.openedBy}`,
  ].join('\n');
}
