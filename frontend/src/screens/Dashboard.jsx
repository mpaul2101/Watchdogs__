import React from 'react';
import { useStore, useNow, getInfrastructureHealth } from '../api.js';
import { 
  Box, 
  Typography, 
  Grid, 
  Paper, 
  Card, 
  CardContent, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Chip,
  Button
} from '@mui/material';
import { ArrowForward as ArrowForwardIcon } from '@mui/icons-material';
import { relTime } from '../components/Common.jsx';

export function DashboardScreen({ currentUser, openIncident, setRoute }) {
  const store = useStore();
  useNow(2500);

  const isAdmin = currentUser.role === 'admin';
  const isEngineer = currentUser.role === 'engineer';

  const allOpen = store.incidents.filter(i => i.status === 'OPEN' || i.status === 'IN_PROGRESS');
  const criticOpen = allOpen.filter(i => i.severity === 'CRITIC');
  const unassigned = allOpen.filter(i => !i.assignee_id);
  const myIncidents = store.incidents.filter(i => i.assignee_id === currentUser.id && (i.status === 'OPEN' || i.status === 'IN_PROGRESS'));

  const health = getInfrastructureHealth();
  const offlineServers = store.servers.filter(s => s.status === 'offline').length;
  const onlineServers = store.servers.filter(s => s.status === 'online').length;

  let kpis = [];
  if (isAdmin) {
    kpis = [
      { label: 'Critical open', value: criticOpen.length, sub: 'P1 incidents', cls: criticOpen.length > 0 ? 'error.main' : 'success.main' },
      { label: 'Unassigned', value: unassigned.length, sub: 'Needs assignment', cls: unassigned.length > 0 ? 'warning.main' : 'success.main' },
      { label: 'Bridges active', value: store.incidents.filter(i => i.bridge_status === 'Active' && i.status !== 'CLOSED' && i.status !== 'RESOLVED').length, sub: 'War rooms', cls: 'info.main' },
      { label: 'Servers offline', value: offlineServers, sub: `Out of ${store.servers.length} total`, cls: offlineServers > 0 ? 'error.main' : 'success.main' },
    ];
  } else {
    kpis = [
      { label: 'My incidents', value: myIncidents.length, sub: myIncidents.length > 0 ? 'Assigned to you' : 'Inbox clear', cls: myIncidents.length > 0 ? 'warning.main' : 'success.main' },
      { label: 'Active in system', value: allOpen.length, sub: 'Open + In Progress', cls: 'info.main' },
      { label: 'Servers offline', value: offlineServers, sub: `Out of ${store.servers.length} total`, cls: offlineServers > 0 ? 'error.main' : 'success.main' },
      { label: 'Bridges active', value: store.incidents.filter(i => i.bridge_status === 'Active' && i.status !== 'CLOSED' && i.status !== 'RESOLVED').length, sub: 'War rooms', cls: 'info.main' },
    ];
  }

  const recentAlarms = store.alarms.slice(0, 8);
  const incidentsList = isAdmin ? allOpen : myIncidents;

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
        Overview
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {kpis.map((k, i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Card elevation={2}>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  {k.label}
                </Typography>
                <Typography variant="h3" component="div" sx={{ color: k.cls, fontWeight: 'bold' }}>
                  {k.value}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {k.sub}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper elevation={2} sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" fontWeight="bold">
                {isAdmin ? 'Active Incidents' : 'My Queue'}
              </Typography>
              <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => setRoute('incidents')}>
                View All
              </Button>
            </Box>
            <TableContainer sx={{ flexGrow: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Title</TableCell>
                    <TableCell>Server</TableCell>
                    <TableCell>Opened</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {incidentsList.slice(0, 8).map(i => (
                    <TableRow key={i.id} hover onClick={() => openIncident(i.id)} sx={{ cursor: 'pointer' }}>
                      <TableCell>#{i.id}</TableCell>
                      <TableCell>
                        <Chip size="small" label={i.severity} color={getSeverityColor(i.severity)} />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {i.title}
                      </TableCell>
                      <TableCell>{i.server_id}</TableCell>
                      <TableCell>{relTime(i.created_at)}</TableCell>
                    </TableRow>
                  ))}
                  {incidentsList.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                        <Typography color="text.secondary">No active incidents.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper elevation={2} sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              Recent Alarms
            </Typography>
            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
              {recentAlarms.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 2 }}>No recent alarms.</Typography>
              ) : (
                recentAlarms.map(a => (
                  <Box key={a.id} sx={{ mb: 2, pb: 2, borderBottom: '1px solid #eee' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="subtitle2" fontWeight="bold">
                        {a.metric_type} on {a.server_id}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {relTime(a.created_at)}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {a.message}
                    </Typography>
                    <Typography variant="caption" color="primary" sx={{ display: 'block', mt: 0.5, cursor: 'pointer' }} onClick={() => openIncident(a.incident_id)}>
                      Incident #{a.incident_id}
                    </Typography>
                  </Box>
                ))
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
