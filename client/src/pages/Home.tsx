import { useAuth } from "../context/AuthContext";
import { avatarUrl } from "../types";

const TEAM_COLORS: Record<string, string> = {
  "Pink Team": "#ec4899",
  "Yellow Team": "#eab308",
  "Orange Team": "#f97316",
  "Red Team": "#ef4444",
  "Green Team": "#22c55e",
  "Blue Team": "#3b82f6",
};

export function Home() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const teamColor = user.team ? TEAM_COLORS[user.team] : null;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img
          src={avatarUrl(user)}
          alt="avatar"
          style={styles.avatar}
        />
        <div style={styles.info}>
          <h2 style={styles.name}>
            {user.global_name ?? user.username}
          </h2>
          <p style={styles.tag}>@{user.username}</p>
          {user.email && <p style={styles.email}>{user.email}</p>}
        </div>
        {teamColor ? (
          <div
            style={{
              ...styles.teamBadge,
              background: teamColor + "33",
              border: `1px solid ${teamColor}`,
              color: teamColor,
            }}
          >
            {user.team}
          </div>
        ) : (
          <p style={styles.noTeam}>No team assigned</p>
        )}
        <button onClick={logout} style={styles.logoutButton}>
          Log out
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#1a1a2e",
  },
  card: {
    background: "#16213e",
    borderRadius: 12,
    padding: "40px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    minWidth: 300,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: "50%",
    border: "3px solid #5865F2",
  },
  info: {
    textAlign: "center",
  },
  name: {
    color: "#ffffff",
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
  },
  tag: {
    color: "#8e9297",
    margin: "4px 0 0",
    fontSize: 14,
  },
  email: {
    color: "#b9bbbe",
    margin: "4px 0 0",
    fontSize: 13,
  },
  teamBadge: {
    borderRadius: 20,
    padding: "6px 16px",
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: "0.02em",
  },
  noTeam: {
    color: "#4f545c",
    fontSize: 13,
    margin: 0,
  },
  logoutButton: {
    background: "transparent",
    border: "1px solid #4f545c",
    color: "#b9bbbe",
    borderRadius: 6,
    padding: "8px 20px",
    fontSize: 14,
    cursor: "pointer",
    marginTop: 8,
  },
};
