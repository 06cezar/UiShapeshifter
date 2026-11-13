// Panoul de control în extensie (D9): montat în shadow DOM-ul nostru, peste orice site, cu store-ul lui.
// Content script-ul îi dă mesajele serverului (`journal.getState().handleServerMessage`) și ce trebuie ca să oprească
// o rulare sau să revină la original; propunerile (`propose_changes`) trec prin `askProposal`.

import { createRoot } from "react-dom/client";
import type { OurRoot } from "../extension/shadow-root";
import { createJournalStore, type JournalStore, type ProposalDecision } from "./journal-store";
import { JournalPanel, type JournalPanelProps } from "./JournalPanel";
import { JOURNAL_CSS } from "./journal-styles";

export interface MountedJournal {
  journal: JournalStore;
  /** Arată bara „Păstrez / Anulez” și așteaptă alegerea omului. */
  askProposal(proposal: {
    proposalId: string;
    title: string;
    summary: string;
    revisionBefore: number;
  }): Promise<ProposalDecision>;
  destroy(): void;
}

export function mountJournal(root: OurRoot, props: Omit<JournalPanelProps, "journal">): MountedJournal {
  const journal = createJournalStore();
  root.addStyle(JOURNAL_CSS);
  const container = document.createElement("div");
  container.id = "journal-panel"; // AGENT_UI_IDS: auditul nostru o deosebește de site
  root.shadow.append(container);
  const reactRoot = createRoot(container);
  reactRoot.render(<JournalPanel journal={journal} {...props} />);

  return {
    journal,
    askProposal: (proposal) => journal.getState().requestProposalDecision(proposal),
    destroy() {
      reactRoot.unmount();
      container.remove();
    },
  };
}
