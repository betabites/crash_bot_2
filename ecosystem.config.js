module.exports = {
  apps : [{
    name: "Crash Bot",
    script: 'dist/index.js',
    node_args: "--enable-source-maps",
    watch: '.',
    // interpreter: '/home/ubscontrol/.nvm/versions/node/v23.7.0/bin/node',
  }],

  deploy : {
    production : {
      user : 'SSH_USERNAME',
      host : 'SSH_HOSTMACHINE',
      ref  : 'origin/master',
      repo : 'GIT_REPOSITORY',
      path : 'DESTINATION_PATH',
      'pre-deploy-local': '',
      'post-deploy' : 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
