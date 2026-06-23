import React, { useState } from 'react';
import { useStore, startBridge, assignIncident } from '../api.js';
import { 
  Box, 
  Typography, 
  Paper, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Chip,
  Button,
  Select,
  MenuItem,
  FormControl,
  Snackbar,
  Alert
} from '@mui/material';
import { Phone as PhoneIcon } from '@mui/icons-material';

export function IncidentsScreen({ currentUser }) {
  const store = useStore();
  const incidents = store.incidents || [];
  const users = store.users || [];
  const engineers = users.filter(u => u.role === 'engineer');

  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [assigningId, setAssigningId] = useState(null);
  
  const isAdmin = currentUser.role === 'admin';

  const handleAssign = async (incidentId, assigneeId) => {
    try {
      await assignIncident(incidentId, assigneeId);
      setToast({ open: true, message: 'Incident assigned successfully!', severity: 'success' });
    } catch (err) {
      setToast({ open: true, message: err.message || 'Failed to assign incident', severity: 'error' });
    }
    setAssigningId(null);
  };

  const handleBridgeCall = async (incidentId) => {
    try {
      await startBridge(incidentId);
      setToast({ open: true, message: 'Bridge call created and team notified!', severity: 'success' });
    } catch (err) {
      setToast({ open: true, message: err.message || 'Failed to start bridge call', severity: 'error' });
    }
  };

  const getSeverityColor = (sev) => {
    switch(sev) {
      case 'CRITIC': return 'error';
      case 'HIGH': return 'warning';
      case 'MEDIUM': return 'info';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        {isAdmin ? 'All Incidents' : 'My Assigned Incidents'}
      </Typography>
      
      <TableContainer component={Paper} elevation={2} sx={{ mt: 3 }}>
        <Table>
          <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.02)' }}>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Severity</TableCell>
              <TableCell>Server</TableCell>
              <TableCell>Metric</TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Assignee</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {incidents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 8 : 7} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">No incidents found.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              incidents.map((incident) => {
                const assignee = users.find(u => u.id === incident.assignee_id);
                return (
                  <TableRow key={incident.id} hover>
                    <TableCell>#{incident.id}</TableCell>
                    <TableCell>
                      <Chip size="small" label={incident.severity} color={getSeverityColor(incident.severity)} />
                    </TableCell>
                    <TableCell>{incident.server_id}</TableCell>
                    <TableCell>{incident.metric_type}</TableCell>
                    <TableCell>{incident.title}</TableCell>
                    <TableCell>
                      {isAdmin ? (
                        assigningId === incident.id ? (
                          <FormControl size="small" sx={{ minWidth: 120 }}>
                            <Select
                              autoFocus
                              value={incident.assignee_id || ''}
                              onChange={(e) => handleAssign(incident.id, e.target.value)}
                              onBlur={() => setAssigningId(null)}
                            >
                              <MenuItem value=""><em>Unassigned</em></MenuItem>
                              {engineers.map(e => (
                                <MenuItem key={e.id} value={e.id}>{e.name || e.username}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        ) : (
                          <Box sx={{ cursor: 'pointer', borderBottom: '1px dashed #ccc', display: 'inline-block' }} onClick={() => setAssigningId(incident.id)}>
                            {assignee ? (assignee.name || assignee.username) : 'Unassigned'}
                          </Box>
                        )
                      ) : (
                        assignee ? (assignee.name || assignee.username) : 'Unassigned'
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined" label={incident.status} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Snackbar 
        open={toast.open} 
        autoHideDuration={6000} 
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setToast({ ...toast, open: false })} severity={toast.severity} sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
