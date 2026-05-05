import { useState } from "react";
import { FileText } from "lucide-react";

export function Regulatory() {
  const [activeDoc, setActiveDoc] = useState("tos");

  const documents = [
    { id: "tos", title: "Terms of Service" },
    { id: "privacy", title: "Privacy Policy" },
    { id: "aup", title: "Acceptable Use Policy" },
    { id: "integrity", title: "Proof Integrity & Transparency Statement" },
    { id: "dpa", title: "Data Processing Agreement" },
    { id: "api", title: "API & Developer Terms" },
    { id: "disclaimer", title: "Disclaimer" },
  ];

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Hero */}
      <section className="py-16 px-6 border-b border-border">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-4xl lg:text-5xl font-medium tracking-tight mb-4">
            Regulatory Suite
          </h1>
          <p className="text-lg text-muted-foreground">
            Legal and compliance documentation
          </p>
        </div>
      </section>

      <div className="flex flex-1">
        {/* Sidebar Navigation */}
        <aside className="w-80 border-r border-border p-6 space-y-2">
          <div className="text-sm font-medium text-muted-foreground mb-4 px-4">Documents</div>
          {documents.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setActiveDoc(doc.id)}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-colors flex items-center gap-3 ${
                activeDoc === doc.id
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50"
              }`}
            >
              <FileText className="w-4 h-4 flex-shrink-0" />
              <span>{doc.title}</span>
            </button>
          ))}
        </aside>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-8 py-12">
            {activeDoc === "tos" && <TermsOfService />}
            {activeDoc === "privacy" && <PrivacyPolicy />}
            {activeDoc === "aup" && <AcceptableUsePolicy />}
            {activeDoc === "integrity" && <ProofIntegrityStatement />}
            {activeDoc === "dpa" && <DataProcessingAgreement />}
            {activeDoc === "api" && <APITerms />}
            {activeDoc === "disclaimer" && <Disclaimer />}
          </div>
        </div>
      </div>
    </div>
  );
}

function TermsOfService() {
  return (
    <div className="prose prose-invert max-w-none">
      <h1>Terms of Service</h1>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using Aproof ("the Service"), you agree to be bound by these Terms of
        Service. If you do not agree, you may not use the Service.
      </p>

      <h2>2. Description of Service</h2>
      <p>Aproof provides proof-of-integrity verification for systems including but not limited to:</p>
      <ul>
        <li>AI models (LLMs)</li>
        <li>Agents</li>
        <li>Services</li>
        <li>Systems</li>
        <li>Endpoints</li>
      </ul>
      <p>The Service generates immutable verification records ("Proofs") based on submitted or observed data.</p>

      <h2>3. No Guarantee of Absolute Accuracy</h2>
      <p>Aproof provides deterministic analysis based on available inputs, baselines, and system rules. While designed for high integrity:</p>
      <ul>
        <li>Results are not guaranteed to be error-free</li>
        <li>Proofs are dependent on input data quality</li>
        <li>Users are responsible for interpretation</li>
      </ul>

      <h2>4. User Responsibilities</h2>
      <p>You agree to:</p>
      <ul>
        <li>Provide accurate data inputs</li>
        <li>Not attempt to manipulate proof generation</li>
        <li>Not use the system for unlawful purposes</li>
        <li>Maintain security of your API keys and credentials</li>
      </ul>

      <h2>5. API Usage</h2>
      <ul>
        <li>Each user is assigned a subject context</li>
        <li>Abuse, excessive load, or malicious use may result in termination</li>
        <li>Rate limits may be enforced</li>
      </ul>

      <h2>6. Data Processing</h2>
      <p>Data submitted to Aproof will:</p>
      <ul>
        <li>Be canonicalized</li>
        <li>Be processed into event structures</li>
        <li>Be used to generate proofs and lineage records</li>
      </ul>

      <h2>7. Immutable Records</h2>
      <p>Proofs generated may be:</p>
      <ul>
        <li>Stored permanently</li>
        <li>Anchored to blockchain systems</li>
        <li>Non-editable once finalized</li>
      </ul>

      <h2>8. Limitation of Liability</h2>
      <p>Aproof is not liable for:</p>
      <ul>
        <li>Business decisions made based on proofs</li>
        <li>Regulatory outcomes</li>
        <li>Loss of revenue or data</li>
      </ul>

      <h2>9. Termination</h2>
      <p>We reserve the right to suspend or terminate access at any time for violations.</p>

      <h2>10. Modifications</h2>
      <p>Terms may be updated at any time. Continued use constitutes acceptance.</p>

      <h2>11. Governing Law</h2>
      <p>These Terms are governed by applicable jurisdictional law where the entity is registered.</p>
    </div>
  );
}

function PrivacyPolicy() {
  return (
    <div className="prose prose-invert max-w-none">
      <h1>Privacy Policy</h1>

      <h2>1. Overview</h2>
      <p>Aproof is committed to protecting user privacy while enabling verifiable system integrity.</p>

      <h2>2. Data Collected</h2>
      <p>We may collect:</p>
      <ul>
        <li>Account information (email, organization)</li>
        <li>API usage data</li>
        <li>Submitted event and system data</li>
        <li>Metadata associated with proofs</li>
      </ul>

      <h2>3. Data Usage</h2>
      <p>Data is used to:</p>
      <ul>
        <li>Generate proofs</li>
        <li>Maintain system integrity</li>
        <li>Improve verification processes</li>
      </ul>

      <h2>4. Data Storage</h2>
      <ul>
        <li>Canonicalized data may be stored in secure databases</li>
        <li>Proof hashes may be anchored to blockchain networks</li>
        <li>Sensitive data should not be submitted unless properly anonymized</li>
      </ul>

      <h2>5. No Sale of Data</h2>
      <p>We do not sell user data.</p>

      <h2>6. Security</h2>
      <p>We implement:</p>
      <ul>
        <li>Encryption at rest and in transit</li>
        <li>Access control systems</li>
        <li>Audit logging</li>
      </ul>

      <h2>7. User Rights</h2>
      <p>Users may:</p>
      <ul>
        <li>Request deletion of non-anchored data</li>
        <li>Request access to stored records</li>
      </ul>

      <h2>8. Third-Party Services</h2>
      <p>We may use third-party infrastructure providers (cloud, blockchain nodes).</p>

      <h2>9. Changes</h2>
      <p>Policy updates will be communicated via the platform.</p>
    </div>
  );
}

function AcceptableUsePolicy() {
  return (
    <div className="prose prose-invert max-w-none">
      <h1>Acceptable Use Policy</h1>

      <h2>Prohibited Activities</h2>
      <p>Users may not:</p>
      <ul>
        <li>Submit fraudulent or fabricated data</li>
        <li>Attempt to manipulate proof outputs</li>
        <li>Reverse engineer or exploit the system</li>
        <li>Use Aproof for illegal surveillance or harm</li>
      </ul>

      <h2>Abuse Detection</h2>
      <p>We monitor:</p>
      <ul>
        <li>Unusual API behavior</li>
        <li>Data anomalies</li>
        <li>System abuse patterns</li>
      </ul>

      <h2>Enforcement</h2>
      <p>Violations may result in:</p>
      <ul>
        <li>Immediate suspension</li>
        <li>Permanent bans</li>
        <li>Reporting to authorities if necessary</li>
      </ul>
    </div>
  );
}

function ProofIntegrityStatement() {
  return (
    <div className="prose prose-invert max-w-none">
      <h1>Proof Integrity & Transparency Statement</h1>

      <p>Aproof is designed to produce deterministic, traceable, and immutable verification outputs.</p>

      <h2>Core Principles</h2>

      <h3>1. Determinism</h3>
      <p>All proofs are generated using:</p>
      <ul>
        <li>Defined baselines</li>
        <li>Structured validation rules</li>
        <li>Canonicalized input data</li>
      </ul>

      <h3>2. Traceability</h3>
      <p>Each proof includes:</p>
      <ul>
        <li>Event lineage</li>
        <li>Evidence references</li>
        <li>Processing steps</li>
      </ul>

      <h3>3. Non-Mutability</h3>
      <p>Once generated:</p>
      <ul>
        <li>Proofs cannot be altered</li>
        <li>Any change results in a new proof</li>
      </ul>

      <h3>4. No Silent Failures</h3>
      <p>If required data is missing:</p>
      <ul>
        <li>The system fails explicitly</li>
        <li>No angle is left blank</li>
      </ul>

      <h3>5. Full Angle Coverage</h3>
      <p>Each subject is evaluated across:</p>
      <ul>
        <li>Policy Integrity</li>
        <li>Identity & Access Integrity</li>
        <li>Operational Integrity</li>
        <li>Cross-System Integrity</li>
        <li>Deterministic Integrity</li>
        <li>Retrieval Integrity</li>
        <li>Model Identity Integrity</li>
      </ul>

      <h2>6. Anchoring</h2>
      <p>Proof hashes may be:</p>
      <ul>
        <li>Batched</li>
        <li>Anchored to blockchain</li>
        <li>Publicly verifiable</li>
      </ul>

      <h2>7. Audit Readiness</h2>
      <p>Aproof is designed for:</p>
      <ul>
        <li>SOC 2 environments</li>
        <li>Healthcare compliance workflows</li>
        <li>Enterprise audit trails</li>
      </ul>
    </div>
  );
}

function DataProcessingAgreement() {
  return (
    <div className="prose prose-invert max-w-none">
      <h1>Data Processing Agreement (DPA)</h1>

      <h2>1. Roles</h2>
      <ul>
        <li>User = Data Controller</li>
        <li>Aproof = Data Processor</li>
      </ul>

      <h2>2. Processing Scope</h2>
      <p>Aproof processes data solely for:</p>
      <ul>
        <li>Proof generation</li>
        <li>Verification workflows</li>
      </ul>

      <h2>3. Data Protection Measures</h2>
      <ul>
        <li>Encryption</li>
        <li>Access control</li>
        <li>Audit logging</li>
      </ul>

      <h2>4. Subprocessors</h2>
      <p>May include:</p>
      <ul>
        <li>Cloud infrastructure providers</li>
        <li>Blockchain services</li>
      </ul>

      <h2>5. Data Retention</h2>
      <ul>
        <li>Proof data may be retained for audit purposes</li>
        <li>Anchored data cannot be deleted</li>
      </ul>

      <h2>6. Breach Notification</h2>
      <p>Users will be notified of any data breach within a reasonable timeframe.</p>

      <h2>7. Compliance</h2>
      <p>Designed to align with:</p>
      <ul>
        <li>GDPR principles</li>
        <li>SOC 2 expectations</li>
      </ul>
    </div>
  );
}

function APITerms() {
  return (
    <div className="prose prose-invert max-w-none">
      <h1>API & Developer Terms</h1>

      <h2>1. API Access</h2>
      <p>Access is granted via API keys tied to a subject.</p>

      <h2>2. Rate Limits</h2>
      <ul>
        <li>Enforced per user</li>
        <li>Abuse may result in throttling</li>
      </ul>

      <h2>3. Data Integrity</h2>
      <p>Developers must:</p>
      <ul>
        <li>Ensure correct event structure</li>
        <li>Maintain consistency of artifact identity</li>
      </ul>

      <h2>4. Prohibited Use</h2>
      <ul>
        <li>Fake event injection</li>
        <li>Proof tampering attempts</li>
      </ul>

      <h2>5. Versioning</h2>
      <p>APIs may evolve; backward compatibility is not guaranteed indefinitely.</p>

      <h2>6. Logging</h2>
      <p>All API interactions may be logged for:</p>
      <ul>
        <li>Security</li>
        <li>Traceability</li>
      </ul>
    </div>
  );
}

function Disclaimer() {
  return (
    <div className="prose prose-invert max-w-none">
      <h1>Disclaimer</h1>

      <p>
        Aproof provides system-generated verification outputs intended for informational and
        audit-support purposes only.
      </p>

      <p>Aproof does not:</p>
      <ul>
        <li>Provide legal advice</li>
        <li>Certify compliance</li>
        <li>Replace regulatory bodies</li>
      </ul>

      <p>Users are responsible for:</p>
      <ul>
        <li>Interpreting results</li>
        <li>Meeting regulatory obligations</li>
      </ul>

      <p>Use of the Service is at your own risk.</p>
    </div>
  );
}
