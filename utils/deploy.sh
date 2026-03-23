if [ "$1" == "prod" ] ; then
   if [ "$2" != "confirm" ] && [ "$3" != "confirm" ]  && [ "$4" != "confirm" ]; then
      echo "Must add 'confirm' to deploy to prod"
      exit 1
   fi
   HOST="root@136.243.174.166"
else
   echo "Must specify environment (prod)"
   exit 1
fi

FOLDER="vibey"

wc -l client.js client-css.js server.js test-client.js test-server.js website.js secret.js utils/deploy.sh

if [ "$2" == "client" ] ; then
   scp client.js client-css.js $HOST:$FOLDER
   exit 0
fi

if [ "$2" == "server" ] ; then
   scp server.js $HOST:$FOLDER
   ssh $HOST "cd $FOLDER && VIBEY_CLOUD=1 mg restart"
   exit 0
fi

if [ "$2" == "website" ] ; then
   node ../website
   scp website.html $HOST:/var/www/html
   exit 0
fi

rsync -av . $HOST:$FOLDER
ssh $HOST chown -R root /root/$FOLDER
ssh $HOST "cd $FOLDER && npm i --no-save --omit=dev && VIBEY_CLOUD=1 mg restart"
