import React from 'react';
import { useStore, markNotificationRead } from '../api.js';
import { 
  Box, 
  Typography, 
  Paper, 
  List, 
  ListItem, 
  ListItemText, 
  Button, 
  Chip,
  IconButton
} from '@mui/material';
import { CheckCircle as CheckCircleIcon, OpenInNew as OpenInNewIcon } from '@mui/icons-material';

export function NotificationsScreen({ currentUser, openIncident }) {
  const store = useStore();
  const notifications = store.notifications || [];

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
    } catch (err) {
      console.error("Failed to mark read", err);
    }
  };

  const extractIncidentId = (msg) => {
    const match = msg.match(/#(\d+)/);
    return match ? parseInt(match[1]) : null;
  };

  const handleAction = (notif) => {
    const incId = extractIncidentId(notif.message);
    if (incId) openIncident(incId);
  };

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Notifications
      </Typography>
      
      <Paper elevation={2} sx={{ mt: 3, p: 2 }}>
        {notifications.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
            You have no notifications.
          </Typography>
        ) : (
          <List>
            {notifications.map((n) => (
              <ListItem 
                key={n.id} 
                divider
                sx={{ 
                  bgcolor: n.is_read ? 'transparent' : 'rgba(25, 118, 210, 0.08)',
                  borderRadius: 1,
                  mb: 1
                }}
                secondaryAction={
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button 
                      size="small" 
                      variant="outlined" 
                      startIcon={<OpenInNewIcon />}
                      onClick={() => handleAction(n)}
                    >
                      {n.type === 'assignment' ? 'View Incident' : 'View Bridge Call'}
                    </Button>
                    {!n.is_read && (
                      <IconButton color="primary" onClick={() => handleMarkRead(n.id)} title="Mark as read">
                        <CheckCircleIcon />
                      </IconButton>
                    )}
                  </Box>
                }
              >
                <ListItemText 
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography fontWeight={n.is_read ? 'normal' : 'bold'}>
                        {n.message}
                      </Typography>
                      <Chip size="small" label={n.type} color={n.type === 'assignment' ? 'secondary' : 'error'} variant="outlined" />
                    </Box>
                  }
                  secondary={new Date(n.created_at).toLocaleString()}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
}
