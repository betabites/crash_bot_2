module.exports = {
  apps : [{
    name: "Crash Bot",
    script: 'npm',
    args: "run start",
    node_args: "--enable-source-maps",
    watch: true,
    interpreter: "none",
    ignore_watch: ["node_modules", "assets"],
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
